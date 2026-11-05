import test from 'node:test';
import assert from 'node:assert/strict';
import { db, generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode } from './db.ts';
import { neonPostgres } from './postgres.ts';

test('1. RECOVERY CODE: Strong code at registration, hash-only storage, atomic recovery', async () => {
  const email = `test_recovery_${Date.now()}@example.com`;
  const initialPassword = 'InitialSecurePassword123!';
  const userWithCode = await db.createUser('Recovery Test User', email, initialPassword);

  assert.ok(userWithCode.id, 'User was created');
  assert.ok(userWithCode.recoveryCode, 'Strong recovery code generated at registration');
  assert.match(userWithCode.recoveryCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Code matches 16-char format');

  // Verify DB stores ONLY the hash, not plain code
  const storedUser = (await db.getUserById(userWithCode.id))!;
  assert.ok(storedUser.recoveryCodeHash, 'Recovery code hash stored');
  assert.notEqual(storedUser.recoveryCodeHash, userWithCode.recoveryCode, 'Plain code is NOT stored in DB');
  assert.equal(verifyRecoveryCode(userWithCode.recoveryCode, storedUser.recoveryCodeHash), true, 'Hash verifies code');

  // Create an active session
  const oldSessionToken = await db.createSession(userWithCode.id);
  assert.equal((await db.getUserBySession(oldSessionToken))?.id, userWithCode.id, 'Session active');

  // Attempt recovery with bad code -> fails
  const badRecovery = await db.recoverWithCode(email, 'AAAA-BBBB-CCCC-DDDD', 'NewSecurePassword456!');
  assert.equal(badRecovery.success, false, 'Bad recovery code rejected');

  // Attempt recovery with valid code -> succeeds
  const newPassword = 'NewBrandSecurePassword456!';
  const recoveryResult = await db.recoverWithCode(email, userWithCode.recoveryCode, newPassword);
  assert.equal(recoveryResult.success, true, 'Account recovery succeeded');
  assert.ok(recoveryResult.token, 'New session token issued');

  // Old session MUST be invalidated
  assert.equal(await db.getUserBySession(oldSessionToken), undefined, 'Old session revoked');

  // Recovery code consumed atomically: re-using the same code MUST fail
  const reuseResult = await db.recoverWithCode(email, userWithCode.recoveryCode, 'AnotherPassword789!');
  assert.equal(reuseResult.success, false, 'Recovery code consumed atomically and cannot be reused');

  // Old password rejected, new password verified
  const updatedUser = (await db.getUserById(userWithCode.id))!;
  assert.equal(db.verifyPassword(updatedUser, initialPassword), false, 'Old password rejected');
  assert.equal(db.verifyPassword(updatedUser, newPassword), true, 'New password accepted');

  // Clean up
  await db.deleteUserAccount(userWithCode.id);
});

test('2. RECOVERY CODE REGENERATION: Signed-in user replacement in Settings', async () => {
  const email = `test_regen_${Date.now()}@example.com`;
  const user = await db.createUser('Regen User', email, 'Password123!');
  const firstCode = user.recoveryCode;

  // Generate replacement code in settings
  const regenResult = await db.regenerateRecoveryCode(user.id);
  assert.ok(regenResult, 'Replacement code generated');
  assert.notEqual(regenResult.recoveryCode, firstCode, 'New code is distinct from previous code');

  // Old code no longer works
  const oldCodeAttempt = await db.recoverWithCode(email, firstCode, 'HackedPassword123!');
  assert.equal(oldCodeAttempt.success, false, 'Old recovery code invalidated');

  // New code works
  const newCodeAttempt = await db.recoverWithCode(email, regenResult.recoveryCode, 'FreshPassword789!');
  assert.equal(newCodeAttempt.success, true, 'Replacement recovery code succeeds');

  // Clean up
  await db.deleteUserAccount(user.id);
});

test('3. ACCOUNT SETTINGS: Two-field password change without current password', async () => {
  const email = `test_change_${Date.now()}@example.com`;
  const initialPassword = 'InitialSecurePassword123!';
  const user = await db.createUser('Settings Test User', email, initialPassword);

  const sessionToken = await db.createSession(user.id);

  // Change password using 2-field form (newPassword, without current password)
  const newPassword = 'UpdatedSettingsPassword789!';
  const result = await db.updateUserPassword(user.id, newPassword, sessionToken);
  assert.equal(result.success, true, 'Password changed without requiring current password');

  // Verify old password no longer works and new password works
  const updatedUser = (await db.getUserById(user.id))!;
  assert.equal(db.verifyPassword(updatedUser, initialPassword), false, 'Old password no longer works');
  assert.equal(db.verifyPassword(updatedUser, newPassword), true, 'New password verified');

  // Clean up
  await db.deleteUserAccount(user.id);
});

test('4. DELETE ACCOUNT AND ALL DATA: Permanent deletion and isolation', async () => {
  const email = `test_delete_${Date.now()}@example.com`;
  const user = await db.createUser('Delete Test User', email, 'Password123!');
  const sessionToken = await db.createSession(user.id);

  // Add dummy shipment for this user
  const shipment = await db.addShipment(user.id, {
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
  const ticket = await db.createTicket({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    category: 'delivery_delay',
    subject: 'Delayed parcel',
    description: 'Help with my shipment',
  });
  assert.ok(ticket.id, 'Ticket saved');

  // Add dummy alert
  const alert = await db.addAlert({
    userId: user.id,
    shipmentId: shipment.id,
    shipmentItem: shipment.item,
    trackingNumber: shipment.trackingNumber,
    type: 'out_for_delivery',
    title: 'Out for delivery',
    message: 'On the way',
  });
  assert.ok(alert.id, 'Alert saved');

  // Verify records exist before deletion
  assert.equal((await db.getShipmentsForUser(user.id)).length, 1);
  assert.equal((await db.getTicketsForUser(user.id)).length, 1);
  assert.equal((await db.getAlertsForUser(user.id)).length, 1);
  assert.equal((await db.getUserBySession(sessionToken))?.id, user.id);

  // Execute permanent deletion
  const deleteResult = await db.deleteUserAccount(user.id);
  assert.equal(deleteResult.success, true, 'Account deletion succeeded');

  // Verify all records are gone
  assert.equal(await db.getUserById(user.id), undefined, 'User record completely removed');
  assert.equal(await db.getUserByEmail(email), undefined, 'Cannot look up deleted user by email');
  assert.equal(await db.getUserBySession(sessionToken), undefined, 'Session revoked');
  assert.equal((await db.getShipmentsForUser(user.id)).length, 0, 'No remaining shipments');
  assert.equal((await db.getTicketsForUser(user.id)).length, 0, 'No remaining tickets');
  assert.equal((await db.getAlertsForUser(user.id)).length, 0, 'No remaining alerts');

  // Re-registration with the same email must start completely fresh
  const reRegisteredUser = await db.createUser('Fresh User', email, 'BrandNewPass999!');
  assert.ok(reRegisteredUser.id, 'New account registered with same email');
  assert.notEqual(reRegisteredUser.id, user.id, 'New user gets a new ID');
  assert.equal((await db.getShipmentsForUser(reRegisteredUser.id)).length, 0, 'Starts with 0 shipments');
  assert.equal((await db.getTicketsForUser(reRegisteredUser.id)).length, 0, 'Starts with 0 tickets');
  assert.equal((await db.getAlertsForUser(reRegisteredUser.id)).length, 0, 'Starts with 0 alerts');

  // Clean up
  await db.deleteUserAccount(reRegisteredUser.id);
});

test('5. SIGN-OUT & RE-SIGN-IN: Durable persistence without account loss', async () => {
  const rawEmail = `Persistence_User_${Date.now()}@Example.COM`;
  const password = 'DurablePassword2026!';

  // Register user
  const user = await db.createUser('Persistence User', rawEmail, password, true);
  const normalizedEmail = rawEmail.trim().toLowerCase();
  assert.equal(user.email, normalizedEmail, 'Email normalized to lowercase');

  // Add a saved parcel for this user
  const shipment = await db.addShipment(user.id, {
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
  const sessionToken = await db.createSession(user.id);
  assert.equal((await db.getUserBySession(sessionToken))?.id, user.id, 'Session active');

  // User Signs Out: ONLY the session token is removed
  await db.removeSession(sessionToken);
  assert.equal(await db.getUserBySession(sessionToken), undefined, 'Session token revoked');

  // User account and parcels MUST NOT BE DELETED by signing out
  const userAfterSignOut = await db.getUserByEmail(normalizedEmail);
  assert.ok(userAfterSignOut, 'User account still exists after sign-out');
  assert.equal(userAfterSignOut.id, user.id, 'User ID preserved');

  const parcelsAfterSignOut = await db.getShipmentsForUser(user.id);
  assert.equal(parcelsAfterSignOut.length, 1, 'Shipments preserved after sign-out');
  assert.equal(parcelsAfterSignOut[0].id, shipment.id, 'Shipment ID preserved');

  // User Signs In Again with SAME credentials: MUST SUCCEED
  const reLoginUser = await db.getUserByEmail(normalizedEmail);
  assert.ok(reLoginUser, 'Account found for login');
  assert.equal(db.verifyPassword(reLoginUser, password), true, 'Same credentials verify');

  const newSessionToken = await db.createSession(reLoginUser.id);
  assert.ok(newSessionToken, 'New session generated');
  assert.equal((await db.getUserBySession(newSessionToken))?.id, user.id, 'Logged in to same account');

  // Clean up
  await db.deleteUserAccount(user.id);
});

test('6. NEON POSTGRESQL & HEALTH: Health query execution', async () => {
  const health = await neonPostgres.runHealthQuery();
  assert.ok(health.status, 'Health query returned status');
  assert.ok(health.healthy, 'Health check indicates healthy database state');
  assert.ok(health.database === 'neon_postgres' || health.database === 'in_memory_file', 'Valid database mode');
});
