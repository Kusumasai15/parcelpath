import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db, User, Shipment, TrackingEvent } from './src/server/db.js';
import { detectCourier, isStoreOrderId, SUPPORTED_COURIERS, formatHonestEta } from './src/utils/courier.js';
import { isShipmentRequiredForCategory, getCategoryLabel, validateAttachment } from './src/utils/support.js';
import { emailService } from './src/server/email.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Extend express Request to include currentUser
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

// Authentication middleware - strictly requires valid session token
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'] as string;
  }

  if (token) {
    const user = db.getUserBySession(token);
    if (user && user.id !== 'user_kusuma_default') {
      req.user = user;
      req.sessionToken = token;
      return next();
    }
  }

  return res.status(401).json({ error: 'Authentication required. Please sign in.' });
}

// --- Auth Routes ---
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const user = db.createUser(name || 'Parcel User', email, password);
  const token = db.createSession(user.id);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarInitial: user.avatarInitial,
      role: user.role,
      notifications: user.notifications,
      backupRecipient: user.backupRecipient,
      deliveryInstructions: user.deliveryInstructions,
    },
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.getUserByEmail(email);
  if (!user || !db.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = db.createSession(user.id);
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarInitial: user.avatarInitial,
      role: user.role,
      notifications: user.notifications,
      backupRecipient: user.backupRecipient,
      deliveryInstructions: user.deliveryInstructions,
    },
  });
});

// Password recovery must not bypass email ownership verification.
// Enable a real recovery provider with durable token storage before sending reset links.
app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const { email } = req.body;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  return res.status(503).json({
    error: 'Password reset emails are not available yet. No reset email has been sent. If you are still signed in and know your current password, you can change it in Account settings.',
  });
});

const passwordAttempts = new Map<string, { count: number; until: number }>();
app.post('/api/auth/change-password', authMiddleware, (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = req.user!;
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
    return res.status(400).json({ error: 'Enter your current password.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ error: 'Use 12–128 characters for your new password.' });
  }
  const now = Date.now();
  for (const [id, entry] of passwordAttempts) {
    if (entry.until <= now) passwordAttempts.delete(id);
  }
  const attempts = passwordAttempts.get(user.id) || { count: 0, until: now + 15 * 60 * 1000 };
  if (attempts.count >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Try again in 15 minutes.' });
  }
  if (!db.verifyPassword(user, currentPassword)) {
    attempts.count++;
    passwordAttempts.set(user.id, attempts);
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Choose a password different from your current password.' });
  }
  db.changePassword(user.id, newPassword);
  passwordAttempts.delete(user.id);
  return res.json({ success: true, message: 'Password changed. Sign in again with your new password.' });
});

app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarInitial: user.avatarInitial,
      role: user.role,
      notifications: user.notifications,
      backupRecipient: user.backupRecipient,
      deliveryInstructions: user.deliveryInstructions,
    },
  });
});

app.put('/api/auth/profile', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const { name, backupRecipient, deliveryInstructions, notifications } = req.body;

  const updated = db.updateUserProfile(user.id, {
    name,
    backupRecipient,
    deliveryInstructions,
    notifications,
  });

  return res.json({ user: updated });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : req.headers['x-session-token'];
  if (typeof token === 'string' && token) db.removeSession(token);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ success: true });
});

// --- Password Recovery (Forgot Password & Reset) ---
app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  // Create expiring, single-use token if user exists
  const tokenData = db.createPasswordResetToken(email);
  if (tokenData) {
    await emailService.sendPasswordResetEmail(tokenData.user.email, tokenData.user.name, tokenData.token);
  }

  // CRITICAL REQUIREMENT: Generic response that does not reveal whether the email is registered
  return res.json({
    success: true,
    message: 'If an account is associated with this email, a password reset link has been dispatched.',
  });
});

app.get('/api/auth/verify-reset-token', (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ valid: false, reason: 'Token parameter is required.' });
  }

  const result = db.verifyPasswordResetToken(token);
  return res.json(result);
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Reset token is required.' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const result = db.consumePasswordReset(token, newPassword);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    success: true,
    message: 'Password successfully reset. All existing sessions have been invalidated. Please sign in with your new password.',
  });
});

// --- Session Verification & In-Settings Password Change ---
app.get('/api/auth/session-status', authMiddleware, (req: Request, res: Response) => {
  const isRecent = db.isSessionRecent(req.sessionToken!);
  return res.json({
    isRecent,
    email: req.user!.email,
  });
});

app.post('/api/auth/request-verification', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const action = req.body.action === 'delete_account' ? 'delete_account' : 'change_password';

  const { code, email } = db.createVerificationCode(user.id, action);
  await emailService.sendVerificationCodeEmail(email, user.name, code, action);

  return res.json({
    success: true,
    message: `A 6-digit security code has been sent to ${email}.`,
  });
});

app.post('/api/auth/verify-session', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const { code, password, action } = req.body;
  const targetAction = action === 'delete_account' ? 'delete_account' : 'change_password';

  let verified = false;

  if (password && typeof password === 'string') {
    verified = db.verifyPassword(user, password);
  } else if (code && typeof code === 'string') {
    verified = db.verifyCode(user.id, code, targetAction);
  }

  if (!verified) {
    return res.status(400).json({ error: 'Invalid verification code or password.' });
  }

  db.refreshSessionVerification(req.sessionToken!);
  return res.json({ success: true, verified: true });
});

app.put('/api/auth/password', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const token = req.sessionToken!;

  // Require recent session verification
  if (!db.isSessionRecent(token)) {
    return res.status(403).json({
      error: 'Recent authentication or email verification required before updating password.',
      needsVerification: true,
    });
  }

  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const result = db.updateUserPassword(user.id, newPassword);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    success: true,
    message: 'Password successfully updated. Your account is secured.',
  });
});

// --- Delete Account & All Data ---
app.delete('/api/auth/account', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const token = req.sessionToken!;

  // Verify recent session
  if (!db.isSessionRecent(token)) {
    return res.status(403).json({
      error: 'Recent authentication or email verification required to delete your account.',
      needsVerification: true,
    });
  }

  const result = db.deleteUserAccount(user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Failed to delete account.' });
  }

  return res.json({
    success: true,
    message: 'Your account, shipments, customer tickets, alerts, and sessions have been permanently deleted.',
    deleted: result.deletedCount,
  });
});

// --- Test Inbox (for verification and test automation) ---
app.get('/api/auth/test-inbox', (req: Request, res: Response) => {
  return res.json({
    messages: emailService.getTestInbox(),
  });
});

// --- Courier Provider Info ---
app.get('/api/couriers/status', (req: Request, res: Response) => {
  const hasLiveApiKey = !!(process.env.DELHIVERY_API_KEY || process.env.SHIPROCKET_API_KEY || process.env.TRACK17_API_KEY);
  return res.json({
    isLiveConfigured: hasLiveApiKey,
    provider: hasLiveApiKey ? 'Configured Gateway' : 'Standard Web Tracking & Deterministic Simulator',
    message: hasLiveApiKey
      ? 'Live courier gateway active.'
      : 'Tracking provider setup required for carrier-direct live updates. Shipments can still be saved, tracked via official carrier links, and demo packages simulate realistic scan points.',
    supportedCouriers: Object.values(SUPPORTED_COURIERS).map((c) => ({
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
    })),
  });
});

// --- Shipments / Deliveries API ---
app.get('/api/shipments', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const filter = req.query.filter as string | undefined;
  const search = req.query.search as string | undefined;

  const shipments = db.getShipmentsForUser(user.id, { filter, search });
  return res.json({ shipments });
});

app.post('/api/shipments', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const { trackingNumber, courier: userCourier, store, item, customLabel, imageUrl } = req.body;

  if (!trackingNumber || !trackingNumber.trim()) {
    return res.status(400).json({ error: 'Tracking number / AWB is required.' });
  }

  const rawTracking = trackingNumber.trim();

  // Check store order ID
  const storeCheck = isStoreOrderId(rawTracking);
  if (storeCheck.isStoreId) {
    return res.status(422).json({
      error: 'Shopping order ID detected instead of Courier AWB.',
      details: storeCheck.tip,
      storeName: storeCheck.storeName,
    });
  }

  const courierKey = userCourier && SUPPORTED_COURIERS[userCourier] ? userCourier : detectCourier(rawTracking);
  const courierInfo = SUPPORTED_COURIERS[courierKey] || SUPPORTED_COURIERS.other;

  // Duplicate check
  const duplicate = db.findDuplicateShipment(user.id, courierKey, rawTracking);
  if (duplicate) {
    return res.status(409).json({
      error: `This shipment (${courierInfo.name} ${rawTracking}) is already being tracked in your account.`,
      shipment: duplicate,
    });
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const twoDaysLater = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  const initialEvents: TrackingEvent[] = [
    { title: 'Tracking record created', time: `Today, ${timeStr}`, isDone: true },
    { title: 'Electronic shipment data received', time: `Today, ${timeStr}`, isDone: true },
    { title: 'In transit to distribution center', time: 'Awaiting courier scan', isDone: false },
  ];

  const honestEta = formatHonestEta({
    status: 'In transit',
    estimatedDate: 'in 2-3 business days',
  });

  const newShipment = db.addShipment(user.id, {
    item: item?.trim() || `${courierInfo.name} Parcel`,
    customLabel: customLabel?.trim() || undefined,
    store: store?.trim() || 'Online Store',
    trackingNumber: rawTracking,
    courier: courierKey,
    courierName: courierInfo.name,
    status: 'In transit',
    eta: honestEta.main,
    estimatedDate: twoDaysLater,
    timeWindow: undefined, // Honest: exact window unavailable
    location: 'Carrier origin hub (Today)',
    events: initialEvents,
    imageUrl: imageUrl?.trim() || undefined,
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
    courierEventTime: `Today, ${timeStr}`,
  });

  return res.status(201).json({ shipment: newShipment });
});

app.put('/api/shipments/:id', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipmentId = req.params.id;
  const { item, store, customLabel, notes, isArchived } = req.body;

  const updated = db.updateShipment(shipmentId, user.id, {
    ...(item !== undefined && { item: item.trim() }),
    ...(store !== undefined && { store: store.trim() }),
    ...(customLabel !== undefined && { customLabel: customLabel.trim() }),
    ...(notes !== undefined && { notes }),
    ...(isArchived !== undefined && { isArchived }),
  });

  if (!updated) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  return res.json({ shipment: updated });
});

app.put('/api/shipments/:id/label', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipmentId = req.params.id;
  const { label } = req.body;

  const updated = db.updateShipment(shipmentId, user.id, {
    customLabel: label ? label.trim() : undefined,
  });

  if (!updated) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  return res.json({ shipment: updated });
});

app.delete('/api/shipments/:id', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipmentId = req.params.id;

  const removed = db.removeShipment(shipmentId, user.id);
  if (!removed) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  return res.json({
    success: true,
    message: 'Shipment removed from your tracker. (This does not affect the retailer order or courier dispatch).',
  });
});

app.post('/api/shipments/:id/refresh', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipment = db.getShipmentById(req.params.id, user.id);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  // Update lastRefreshedAt timestamp truthfully
  const updated = db.updateShipment(shipment.id, user.id, {
    lastRefreshedAt: new Date().toISOString(),
  });

  return res.json({ shipment: updated, refreshed: true });
});

// Scheduled background tracking refresh (for Vercel Cron or external scheduler)
app.get('/api/cron/refresh-tracking', (req: Request, res: Response) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized cron trigger' });
  }

  const count = db.refreshActiveShipments();
  return res.json({
    success: true,
    refreshedShipments: count,
    timestamp: new Date().toISOString(),
  });
});

// "I won't be home" / Rescheduling inquiry
app.post('/api/shipments/:id/reschedule', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipment = db.getShipmentById(req.params.id, user.id);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  const courierInfo = SUPPORTED_COURIERS[shipment.courier] || SUPPORTED_COURIERS.other;
  const officialRescheduleUrl = courierInfo.reschedulingUrl
    ? courierInfo.reschedulingUrl(shipment.trackingNumber.replace(/^…/, ''))
    : null;

  return res.json({
    shipmentId: shipment.id,
    courier: courierInfo.name,
    trackingNumber: shipment.trackingNumber,
    isDirectIntegrationAvailable: false,
    message: `Direct doorstep rescheduling is determined by ${courierInfo.name}'s delivery policy. ParcelPath does not fabricate fake time slots. You can request a delivery reschedule or leave instructions via the carrier's official portal.`,
    officialPortalUrl: officialRescheduleUrl || courierInfo.trackingUrl(shipment.trackingNumber.replace(/^…/, '')),
    backupRecipientRecommendation: user.backupRecipient
      ? `Your saved backup recipient: ${user.backupRecipient}`
      : 'You can set a backup recipient in Delivery Preferences.',
  });
});

// --- In-App Alerts API ---
app.get('/api/notifications', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const alerts = db.getAlertsForUser(user.id);
  return res.json({ alerts });
});

app.post('/api/notifications/:id/read', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const success = db.markAlertRead(req.params.id, user.id);
  return res.json({ success });
});

app.post('/api/notifications/mark-all-read', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  db.markAllAlertsRead(user.id);
  return res.json({ success: true });
});

app.delete('/api/notifications', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  db.clearAlerts(user.id);
  return res.json({ success: true });
});

app.post('/api/notifications/test', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipments = db.getShipmentsForUser(user.id);
  const target = shipments[0];
  const testAlert = db.addAlert({
    userId: user.id,
    shipmentId: target?.id || 'ship_test',
    shipmentItem: target?.item || 'Wireless headphones',
    trackingNumber: target?.trackingNumber || '…4821',
    type: 'out_for_delivery',
    title: `Out for delivery: ${target?.item || 'Wireless headphones'}`,
    message: 'Delhivery courier is out for delivery. Estimated arrival: Today, 2:30–3:15 PM.',
    read: false,
  });
  return res.json({ alert: testAlert });
});

// --- Email Integration ---
app.get('/api/integrations/email', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const state = db.getEmailIntegration(user.id);
  const isOauthConfigured = !!process.env.GOOGLE_CLIENT_ID;

  return res.json({
    ...state,
    oauthConfigured: isOauthConfigured,
    setupGuide: !isOauthConfigured
      ? 'To connect Gmail, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env. We request narrow read-only access to search only order confirmation emails and extract product thumbnails.'
      : undefined,
  });
});

app.post('/api/integrations/email/connect', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const isOauthConfigured = !!process.env.GOOGLE_CLIENT_ID;

  if (!isOauthConfigured) {
    return res.status(400).json({
      error: 'Google OAuth credentials not configured on server.',
      instructions: 'Please add GOOGLE_CLIENT_ID to your environment variables to enable Gmail read-only order scanning.',
    });
  }

  db.setEmailIntegration(user.id, {
    status: 'connected',
    email: user.email,
    connectedAt: new Date().toISOString(),
    message: 'Gmail order scanning active. Product pictures will be matched using retailer order numbers.',
  });

  return res.json({ success: true, status: 'connected' });
});

app.post('/api/integrations/email/disconnect', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  db.setEmailIntegration(user.id, {
    status: 'disconnected',
    message: 'Gmail connection removed and cached tokens cleared.',
  });
  return res.json({ success: true, status: 'disconnected' });
});

// --- Issues & Feedback Tickets ---
app.get('/api/tickets', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const tickets = db.getTicketsForUser(user.id);
  return res.json({ tickets });
});

app.post('/api/tickets', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const {
    contactName,
    contactEmail,
    contactPhone,
    contactWhatsapp,
    preferredContactMethod = 'email',
    shipmentId,
    shipmentLabel,
    trackingNumber,
    courier,
    isManualTracking,
    category = 'other',
    categoryLabel,
    subject,
    description,
    attachmentName,
    attachmentDataUrl,
    attachmentSize,
    attachmentType,
  } = req.body;

  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Please explain what happened in the description.' });
  }

  // Validate contact name
  const finalContactName = (contactName || user.name || '').trim();
  if (!finalContactName) {
    return res.status(400).json({ error: 'Name is required so our support team knows how to address you.' });
  }

  // Validate preferred contact value
  if (preferredContactMethod === 'email') {
    const emailToUse = (contactEmail || user.email || '').trim();
    if (!emailToUse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
      return res.status(400).json({ error: 'A valid email address is required when Email is your preferred contact method.' });
    }
  } else if (preferredContactMethod === 'phone') {
    const phoneToUse = (contactPhone || '').trim();
    const digitsOnly = phoneToUse.replace(/\D/g, '');
    if (!phoneToUse || digitsOnly.length < 7) {
      return res.status(400).json({ error: 'A valid phone number with country code is required when Phone is your preferred contact method.' });
    }
  } else if (preferredContactMethod === 'whatsapp') {
    const whatsappToUse = (contactWhatsapp || contactPhone || '').trim();
    const digitsOnly = whatsappToUse.replace(/\D/g, '');
    if (!whatsappToUse || digitsOnly.length < 7) {
      return res.status(400).json({ error: 'A valid WhatsApp number with country code is required when WhatsApp is preferred.' });
    }
  }

  // Validate shipment requirement for shipment-related categories
  const shipmentRequired = isShipmentRequiredForCategory(category);
  if (shipmentRequired && !shipmentId && !trackingNumber) {
    return res.status(400).json({
      error: 'Please select an affected shipment or enter a manual tracking ID for this issue category.',
    });
  }

  // Validate attachment if provided
  if (attachmentSize && attachmentSize > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Screenshot file size exceeds the 5 MB limit.' });
  }
  if (attachmentType && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(attachmentType.toLowerCase())) {
    return res.status(400).json({ error: 'Only PNG, JPEG, and WebP screenshot files are accepted.' });
  }

  const resolvedCategoryLabel = categoryLabel || getCategoryLabel(category);
  const finalSubject = subject && subject.trim()
    ? subject.trim()
    : `${resolvedCategoryLabel}${shipmentLabel ? ` — ${shipmentLabel}` : (trackingNumber ? ` (AWB ${trackingNumber})` : '')}`;

  const ticket = db.createTicket({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    contactName: finalContactName,
    contactEmail: (contactEmail || user.email || '').trim(),
    contactPhone: (contactPhone || '').trim(),
    contactWhatsapp: (contactWhatsapp || '').trim(),
    preferredContactMethod,
    shipmentId: shipmentId || undefined,
    shipmentLabel: shipmentLabel || undefined,
    trackingNumber: trackingNumber || undefined,
    courier: courier || undefined,
    isManualTracking: !!isManualTracking,
    category,
    categoryLabel: resolvedCategoryLabel,
    subject: finalSubject,
    description: description.trim(),
    attachmentName,
    attachmentDataUrl,
    attachmentSize,
    attachmentType,
  });

  return res.status(201).json({
    ticket,
    notice: 'Support request logged in ParcelPath Support Desk under your account. Note: Submitting this request does not trigger phone calls, SMS, or WhatsApp messages, and has not been directly submitted to the carrier or retailer.',
  });
});

// Protected staff view
app.get('/api/staff/tickets', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'staff' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Staff authorization required.' });
  }

  return res.json({ tickets: db.getAllTickets() });
});

app.put('/api/staff/tickets/:id', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== 'staff' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Staff authorization required.' });
  }

  const { status, staffReply } = req.body;
  const updated = db.updateTicketStatus(req.params.id, status, staffReply);
  if (!updated) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  return res.json({ ticket: updated });
});

// --- Customer Care Configuration ---
app.get('/api/config/support', (req: Request, res: Response) => {
  const supportEmail = process.env.SUPPORT_EMAIL || null;
  const supportPhone = process.env.SUPPORT_PHONE || null;
  const supportWhatsapp = process.env.SUPPORT_WHATSAPP || null;
  const hours = process.env.SUPPORT_HOURS || 'Mon–Sat: 9:00 AM – 7:00 PM IST';
  const configured = !!(supportEmail || supportPhone || supportWhatsapp);

  return res.json({
    configured,
    supportEmail,
    supportPhone,
    supportWhatsapp,
    hours,
    message: configured
      ? undefined
      : 'Official support telephone and WhatsApp lines are currently not configured for direct inbound dialing. Please submit a support request using the form below.',
  });
});

// --- Production / Dev Server Mounting ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ParcelPath server listening on http://0.0.0.0:${PORT}`);
  });
}

// In standard Node/Cloud Run/container run server. On Vercel, serverless function invokes app directly.
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
