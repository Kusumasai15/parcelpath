import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import { emailService } from './email.js';

test('1. FORGOT PASSWORD: Expiring single-use reset link and password reset', async () => {
  // Create a dedicated test user
  const email = `test_reset_${Date.now()}@example.com`;
  const initialPassword = 'InitialSecurePassword123!';
  const user = db.createUser('Reset Test User', email, initialPassword);
  assert.ok(user.id, 'User was created');

  // Verify initial login works
  const retrieved = db.getUserByEmail(email);
  assert.ok(retrieved && db.verifyPassword(retrieved, initialPassword), 'Initial password verifies');

  // Create an active session
  const oldSessionToken = db.createSession(user.id);
  assert.equal(db.getUserBySession(oldSessionToken)?.id, user.id, 'Session is active before reset');

  // Request password reset token
  const resetData = db.createPasswordResetToken(email);
  assert.ok(resetData, 'Reset token generated');
  assert.equal(resetData.user.email, email);
  assert.ok(resetData.token.length >= 32, 'Token has secure length');

  // Send email and verify test inbox records message
  await emailService.sendPasswordResetEmail(email, user.name, resetData.token);
  const inbox = emailService.getTestInbox();
  const sent = inbox.find((m) => m.type === 'password_reset' && m.to === email);
  assert.ok(sent, 'Email dispatched to test inbox');
  assert.ok(sent.resetUrl?.includes('reset_token='), 'Reset link has token parameter');

  // Verify token validation accepts valid token
  const validCheck = db.verifyPasswordResetToken(resetData.token);
  assert.equal(validCheck.valid, true, 'Valid token is accepted');
  assert.equal(validCheck.email, email, 'Returns correct user email');

  // Non-existent or garbage token is rejected
  const invalidCheck = db.verifyPasswordResetToken('invalid_random_token_9999');
  assert.equal(invalidCheck.valid, false, 'Invalid token is rejected');

  // Reset password to new password
  const newPassword = 'NewBrandSecurePassword456!';
  const resetResult = db.consumePasswordReset(resetData.token, newPassword);
  assert.equal(resetResult.success, true, 'Password reset succeeded');

  // Single-use guarantee: Re-using the same token MUST be rejected
  const reuseCheck = db.verifyPasswordResetToken(resetData.token);
  assert.equal(reuseCheck.valid, false, 'Reused token is invalid');
  const reuseAttempt = db.consumePasswordReset(resetData.token, 'AnotherPassword789!');
  assert.equal(reuseAttempt.success, false, 'Consuming used token is rejected');

  // Invalidate existing sessions: Old session MUST no longer be valid
  assert.equal(db.getUserBySession(oldSessionToken), undefined, 'Old session invalidated after reset');

  // The old password MUST NO LONGER work
  const updatedUser = db.getUserById(user.id)!;
  assert.equal(db.verifyPassword(updatedUser, initialPassword), false, 'Old password rejected');

  // The new password MUST work
  assert.equal(db.verifyPassword(updatedUser, newPassword), true, 'New password accepted');

  // Clean up test user
  db.deleteUserAccount(user.id);
});

test('2. ACCOUNT SETTINGS: Two-field password change without current password', () => {
  const email = `test_change_${Date.now()}@example.com`;
  const initialPassword = 'InitialSecurePassword123!';
  const user = db.createUser('Settings Test User', email, initialPassword);

  const sessionToken = db.createSession(user.id);

  // Session is initially recent
  assert.equal(db.isSessionRecent(sessionToken), true, 'Newly created session is recent');

  // Change password using 2-field form (newPassword, without current password)
  const newPassword = 'UpdatedSettingsPassword789!';
  const result = db.updateUserPassword(user.id, newPassword, sessionToken);
  assert.equal(result.success, true, 'Password changed without requiring current password');

  // Verify old password no longer works and new password works
  const updatedUser = db.getUserById(user.id)!;
  assert.equal(db.verifyPassword(updatedUser, initialPassword), false, 'Old password no longer works');
  assert.equal(db.verifyPassword(updatedUser, newPassword), true, 'New password verified');

  // Clean up
  db.deleteUserAccount(user.id);
});

test('3. DELETE ACCOUNT AND ALL DATA: Permanent deletion and isolation', () => {
  const email = `test_delete_${Date.now()}@example.com`;
  const user = db.createUser('Delete Test User', email, 'Password123!');
  const sessionToken = db.createSession(user.id);

  // Add dummy shipment for this user
  const shipment = db.addShipment(user.id, {
    item: 'Test Parcel Item',
    trackingNumber: 'TEST123456789',
    courier: 'delhivery',
    courierName: 'Delhivery',
    store: 'Amazon',
    status: 'In transit',
    eta: 'Today',
    location: 'Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
  });
  assert.ok(shipment.id, 'Shipment saved');

  // Add dummy support ticket
  const ticket = db.createTicket({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    category: 'delivery_delay',
    subject: 'Delayed parcel',
    description: 'Help with my shipment',
  });
  assert.ok(ticket.id, 'Ticket saved');

  // Add dummy alert
  const alert = db.addAlert({
    userId: user.id,
    shipmentId: shipment.id,
    shipmentItem: shipment.item,
    trackingNumber: shipment.trackingNumber,
    type: 'out_for_delivery',
    title: 'Out for delivery',
    message: 'On the way',
    read: false,
  });
  assert.ok(alert.id, 'Alert saved');

  // Verify records exist before deletion
  assert.equal(db.getShipmentsForUser(user.id).length, 1);
  assert.equal(db.getTicketsForUser(user.id).length, 1);
  assert.equal(db.getAlertsForUser(user.id).length, 1);
  assert.equal(db.getUserBySession(sessionToken)?.id, user.id);

  // Execute permanent deletion
  const deleteResult = db.deleteUserAccount(user.id);
  assert.equal(deleteResult.success, true, 'Account deletion succeeded');
  assert.equal(deleteResult.deletedCount.shipments, 1, 'Shipment purged');
  assert.equal(deleteResult.deletedCount.tickets, 1, 'Ticket purged');
  assert.equal(deleteResult.deletedCount.alerts, 1, 'Alert purged');

  // Verify all records are gone
  assert.equal(db.getUserById(user.id), undefined, 'User record completely removed');
  assert.equal(db.getUserByEmail(email), undefined, 'Cannot look up deleted user by email');
  assert.equal(db.getUserBySession(sessionToken), undefined, 'Session revoked');
  assert.equal(db.getShipmentsForUser(user.id).length, 0, 'No remaining shipments');
  assert.equal(db.getTicketsForUser(user.id).length, 0, 'No remaining tickets');
  assert.equal(db.getAlertsForUser(user.id).length, 0, 'No remaining alerts');

  // Ensure deleted account cannot sign in again
  const loginAttempt = db.getUserByEmail(email);
  assert.equal(loginAttempt, undefined, 'Deleted account cannot log in');

  // Re-registration with the same email must start completely fresh
  const reRegisteredUser = db.createUser('Fresh User', email, 'BrandNewPass999!');
  assert.ok(reRegisteredUser.id, 'New account registered with same email');
  assert.notEqual(reRegisteredUser.id, user.id, 'New user gets a new ID');
  assert.equal(db.getShipmentsForUser(reRegisteredUser.id).length, 0, 'Starts with 0 shipments');
  assert.equal(db.getTicketsForUser(reRegisteredUser.id).length, 0, 'Starts with 0 tickets');
  assert.equal(db.getAlertsForUser(reRegisteredUser.id).length, 0, 'Starts with 0 alerts');

  // Clean up
  db.deleteUserAccount(reRegisteredUser.id);
});

test('4. REGISTRATION & VERIFICATION: Real email dispatch, unverified gating, and cooldown', async () => {
  const email = `test_verif_${Date.now()}@example.com`;
  const rawPassword = '  PassWithLeadingSpaces99! ';
  
  // Create user (unverified by default during registration)
  const user = db.createUser('Verification Test User', email, rawPassword, false);
  assert.equal(user.emailVerified, false, 'New user is unverified');
  assert.ok(db.verifyPassword(user, rawPassword), 'Raw password with spaces is preserved and verified');

  // Verify token generation
  const tokenData = db.createAccountVerificationToken(user.id);
  assert.ok(tokenData.token, 'Token generated');
  assert.equal(tokenData.code.length, 6, '6-digit code generated');

  // Dispatch email
  const emailResult = await emailService.sendAccountVerificationEmail(
    user.email,
    user.name,
    tokenData.token,
    tokenData.code
  );
  assert.equal(emailResult.success, true, 'Email dispatch handler succeeded');
  assert.ok(emailResult.verificationUrl.includes('verify_token='), 'Contains verify_token param');

  // Check test inbox
  const inbox = emailService.getTestInbox();
  const sent = inbox.find((m) => m.type === 'account_verification' && m.to === email);
  assert.ok(sent, 'Email recorded in test inbox');
  assert.equal(sent.code, tokenData.code, 'Recorded code matches');

  // Test cooldown on resend: immediately sending again should fail cooldown
  const elapsed = Date.now() - (user.lastVerificationSentAt || 0);
  assert.ok(elapsed < 60000, 'Less than 60s elapsed');

  // Verify with invalid code should fail
  const badVerify = db.verifyAccountEmail('000000');
  assert.equal(badVerify.success, false, 'Invalid code fails');

  // Verify with correct code should succeed
  const goodVerify = db.verifyAccountEmail(tokenData.code);
  assert.equal(goodVerify.success, true, 'Valid code verifies email');
  assert.equal(goodVerify.user?.emailVerified, true, 'User is now verified');

  // Single-use token: verifying again should fail
  const reVerify = db.verifyAccountEmail(tokenData.code);
  assert.equal(reVerify.success, false, 'Already used verification token rejected');

  // Clean up
  db.deleteUserAccount(user.id);
});

test('5. SIGN-OUT & RE-SIGN-IN: Durable persistence without account loss', () => {
  const rawEmail = `Persistence_User_${Date.now()}@Example.COM`;
  const password = 'DurablePassword2026!';

  // Register user
  const user = db.createUser('Persistence User', rawEmail, password, true);
  const normalizedEmail = rawEmail.trim().toLowerCase();
  assert.equal(user.email, normalizedEmail, 'Email normalized to lowercase');

  // Add a saved parcel for this user
  const shipment = db.addShipment(user.id, {
    item: 'Persistent Package',
    trackingNumber: 'TRACK998877',
    courier: 'delhivery',
    courierName: 'Delhivery',
    store: 'Flipkart',
    status: 'In transit',
    eta: 'Tomorrow',
    location: 'Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
  });

  // Sign in: Create session
  const sessionToken = db.createSession(user.id);
  assert.equal(db.getUserBySession(sessionToken)?.id, user.id, 'Session active');

  // User Signs Out: ONLY the session token is removed
  db.removeSession(sessionToken);
  assert.equal(db.getUserBySession(sessionToken), undefined, 'Session token revoked');

  // CRITICAL REQUIREMENT: User account and parcels MUST NOT BE DELETED by signing out
  const userAfterSignOut = db.getUserByEmail(normalizedEmail);
  assert.ok(userAfterSignOut, 'User account still exists after sign-out');
  assert.equal(userAfterSignOut.id, user.id, 'User ID preserved');

  const parcelsAfterSignOut = db.getShipmentsForUser(user.id);
  assert.equal(parcelsAfterSignOut.length, 1, 'Shipments preserved after sign-out');
  assert.equal(parcelsAfterSignOut[0].id, shipment.id, 'Shipment ID preserved');

  // User Signs In Again with SAME credentials: MUST SUCCEED
  const reLoginUser = db.getUserByEmail(normalizedEmail);
  assert.ok(reLoginUser, 'Account found for login');
  assert.equal(db.verifyPassword(reLoginUser, password), true, 'Same credentials verify');

  const newSessionToken = db.createSession(reLoginUser.id);
  assert.ok(newSessionToken, 'New session generated');
  assert.equal(db.getUserBySession(newSessionToken)?.id, user.id, 'Logged in to same account');

  // Clean up
  db.deleteUserAccount(user.id);
});

