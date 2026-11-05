import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db, User, Shipment, TrackingEvent } from './src/server/db.ts';
import { neonPostgres } from './src/server/postgres.ts';
import { detectCourier, isStoreOrderId, SUPPORTED_COURIERS, formatHonestEta } from './src/utils/courier.ts';
import { isShipmentRequiredForCategory, getCategoryLabel, validateAttachment } from './src/utils/support.ts';
import { emailService } from './src/server/email.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Normalize incoming paths so routes match whether called with /api/ or rewritten on Vercel
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.url.startsWith('/api') && (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/shipments') ||
    req.url.startsWith('/notifications') ||
    req.url.startsWith('/tickets') ||
    req.url.startsWith('/config') ||
    req.url.startsWith('/couriers') ||
    req.url.startsWith('/health') ||
    req.url.startsWith('/integrations')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

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
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'] as string;
  }

  if (token) {
    try {
      const user = await db.getUserBySession(token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
        return next();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(503).json({ error: `Database service unavailable: ${msg}` });
    }
  }

  return res.status(401).json({ error: 'Authentication required. Please sign in.' });
}

// --- Health Check with Real Neon Database Query ---
app.get('/api/health/db', async (_req: Request, res: Response) => {
  const health = await neonPostgres.runHealthQuery();
  return res.status(health.healthy ? 200 : 503).json(health);
});

// --- Auth Routes ---
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normEmail = (email || '').trim().toLowerCase();
    const existing = await db.getUserByEmail(normEmail);

    if (existing) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in or use your recovery code.',
        code: 'ACCOUNT_EXISTS',
        action: 'sign_in',
      });
    }

    const user = await db.createUser(name || 'Parcel User', normEmail, password, true);
    const token = await db.createSession(user.id);

    return res.status(201).json({
      success: true,
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
      recoveryCode: user.recoveryCode,
      message: 'Account created! Please store your recovery code safely.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(503).json({ error: `Database error: ${msg}` });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normEmail = (email || '').trim().toLowerCase();
    const user = await db.getUserByEmail(normEmail);

    if (!user || !db.verifyPassword(user, password)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = await db.createSession(user.id);
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

// --- Recovery Code Flow (Replaces Email Password Reset) ---
// Rate limit: 5 attempts per 15 minutes per IP + email
const recoveryRateLimits = new Map<string, { count: number; firstAttempt: number }>();

app.post('/api/auth/recover-with-code', (req: Request, res: Response) => {
  const { email, recoveryCode, newPassword, confirmPassword } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const normEmail = (email || '').trim().toLowerCase();
  const rateKey = `${clientIp}_${normEmail}`;
  const now = Date.now();

  const attempt = recoveryRateLimits.get(rateKey);
  if (attempt) {
    if (now - attempt.firstAttempt > 15 * 60 * 1000) {
      recoveryRateLimits.delete(rateKey);
    } else if (attempt.count >= 5) {
      return res.status(429).json({
        error: 'Too many failed recovery attempts. Please try again after 15 minutes.',
      });
    }
  }

  if (!email || !recoveryCode || !newPassword) {
    return res.status(400).json({ error: 'Account email, recovery code, and new password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const result = db.recoverWithCode(normEmail, recoveryCode, newPassword);
  if (!result.success || !result.user || !result.token) {
    const cur = recoveryRateLimits.get(rateKey) || { count: 0, firstAttempt: now };
    cur.count += 1;
    recoveryRateLimits.set(rateKey, cur);
    return res.status(400).json({ error: result.error || 'Invalid email or recovery code.' });
  }

  // Clear rate limit on successful recovery
  recoveryRateLimits.delete(rateKey);

  return res.json({
    success: true,
    message: 'Password reset successfully with recovery code. Previous sessions have been revoked.',
    token: result.token,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      avatarInitial: result.user.avatarInitial,
      role: result.user.role,
      notifications: result.user.notifications,
      backupRecipient: result.user.backupRecipient,
      deliveryInstructions: result.user.deliveryInstructions,
    },
  });
});

app.post('/api/auth/recovery-code/regenerate', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const result = db.regenerateRecoveryCode(user.id);
  if (!result) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  return res.json({
    success: true,
    recoveryCode: result.recoveryCode,
    message: 'New recovery code generated. Store it in a safe place. Previous codes are invalid.',
  });
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

// --- Simplified In-Settings Password Change (Uses active session, no re-prompting) ---
const handlePasswordUpdate = (req: Request, res: Response) => {
  const user = req.user!;
  const token = req.sessionToken!;
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const result = db.updateUserPassword(user.id, newPassword, token);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    success: true,
    message: 'Password successfully updated. All other active sessions have been invalidated.',
  });
};

app.put('/api/auth/password', authMiddleware, handlePasswordUpdate);
app.post('/api/auth/change-password', authMiddleware, handlePasswordUpdate);

// --- Simplified Account Deletion (One confirmation, deletes user data & private attachments, allows fresh registration) ---
app.delete('/api/auth/account', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
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
    timeWindow: undefined,
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
    message: 'Shipment removed from your tracker.',
  });
});

app.post('/api/shipments/:id/refresh', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const shipment = db.getShipmentById(req.params.id, user.id);
  if (!shipment) {
    return res.status(404).json({ error: 'Shipment not found.' });
  }

  const updated = db.updateShipment(shipment.id, user.id, {
    lastRefreshedAt: new Date().toISOString(),
  });

  return res.json({ shipment: updated, refreshed: true });
});

// Scheduled background tracking refresh
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
    message: `Direct doorstep rescheduling is determined by ${courierInfo.name}'s delivery policy. You can request a delivery reschedule or leave instructions via the carrier's portal.`,
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

// --- Gmail Integration & Verified Product Photo Matching ---
app.get('/api/integrations/email', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  const state = db.getEmailIntegration(user.id);
  const isOauthConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return res.json({
    ...state,
    oauthConfigured: isOauthConfigured,
    message: isOauthConfigured
      ? (state.status === 'connected' ? `Connected: ${state.email || 'Gmail'}` : 'Gmail ready to connect.')
      : 'Email photo matching is unavailable. You can still track your parcels.',
  });
});

app.get('/api/auth/google/url', authMiddleware, (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).json({
      error: 'Email photo matching is unavailable. You can still track your parcels.',
    });
  }

  const baseUrl = emailService.getBaseUrl();
  const callbackUrl = `${baseUrl}/api/auth/google/callback`;
  const state = req.sessionToken!;
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  return res.json({ url: authUrl });
});

app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error || !code || !state) {
    return res.redirect('/?email_status=cancelled');
  }

  const sessionToken = String(state);
  const user = db.getUserBySession(sessionToken);
  if (!user) {
    return res.redirect('/?email_status=session_expired');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = emailService.getBaseUrl();
  const callbackUrl = `${baseUrl}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange error:', tokenData);
      return res.redirect('/?email_status=failed');
    }

    let googleEmail = user.email;
    try {
      const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        if (uData.email) googleEmail = uData.email;
      }
    } catch {}

    db.setEmailIntegration(user.id, {
      status: 'connected',
      email: googleEmail,
      connectedAt: new Date().toISOString(),
      message: 'Gmail connected. Scanning order confirmation emails for product photos.',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    });

    // Run photo matching on user's active parcels
    matchGmailPhotosForUser(user.id, tokenData.access_token).catch((err) => {
      console.warn('Gmail photo match background error:', err);
    });

    return res.redirect('/?email_status=connected');
  } catch (err: unknown) {
    console.error('Callback error:', err);
    return res.redirect('/?email_status=error');
  }
});

app.post('/api/integrations/email/disconnect', authMiddleware, (req: Request, res: Response) => {
  const user = req.user!;
  db.setEmailIntegration(user.id, {
    status: 'disconnected',
    message: 'Gmail disconnected.',
  });
  return res.json({ success: true, status: 'disconnected' });
});

app.post('/api/integrations/email/match', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user!;
  const state = db.getEmailIntegration(user.id);
  if (state.status !== 'connected' || !state.accessToken) {
    return res.status(400).json({ error: 'Gmail not connected.' });
  }

  const count = await matchGmailPhotosForUser(user.id, state.accessToken);
  return res.json({ success: true, matchedCount: count });
});

// Photo matching engine for Gmail messages
async function matchGmailPhotosForUser(userId: string, accessToken: string): Promise<number> {
  const shipments = db.getShipmentsForUser(userId);
  let matchedCount = 0;

  for (const shipment of shipments) {
    if (shipment.imageUrl && !shipment.imageUrl.includes('placeholder')) {
      continue;
    }

    try {
      const cleanTracking = shipment.trackingNumber.replace(/^…/, '').trim();
      const query = `${cleanTracking} OR "${shipment.store}"`;
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=3`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) continue;
      const listData = await listRes.json();
      if (!listData.messages || listData.messages.length === 0) continue;

      for (const msgRef of listData.messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) continue;
        const msg = await msgRes.json();

        const imgUrl = extractProductImageUrl(msg);
        if (imgUrl) {
          db.updateShipment(shipment.id, userId, { imageUrl: imgUrl });
          matchedCount++;
          break;
        }
      }
    } catch (e) {
      console.warn(`Error matching photo for shipment ${shipment.id}:`, e);
    }
  }
  return matchedCount;
}

function extractProductImageUrl(messagePayload: any): string | null {
  try {
    const raw = JSON.stringify(messagePayload);
    const patterns = [
      /https:\/\/[a-zA-Z0-9.\-_]*media-amazon\.com\/images\/I\/[a-zA-Z0-9_\-%.]+\.(?:jpg|jpeg|png|webp)/i,
      /https:\/\/[a-zA-Z0-9.\-_]*ssl-images-amazon\.com\/images\/I\/[a-zA-Z0-9_\-%.]+\.(?:jpg|jpeg|png|webp)/i,
      /https:\/\/rukminim[0-9]*\.flixcart\.com\/image\/[0-9a-zA-Z/_\-%.]+\.(?:jpeg|jpg|png|webp)/i,
      /https:\/\/images-static\.nykaa\.com\/media\/catalog\/product\/[0-9a-zA-Z/_\-%.]+\.(?:jpg|jpeg|png|webp)/i,
      /https:\/\/assets\.myntassets\.com\/[0-9a-zA-Z/_\-%.]+\.(?:jpg|jpeg|png|webp)/i,
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match && match[0]) {
        return match[0];
      }
    }
  } catch {}
  return null;
}

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

  const finalContactName = (contactName || user.name || '').trim();
  if (!finalContactName) {
    return res.status(400).json({ error: 'Name is required so our support team knows how to address you.' });
  }

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

  const shipmentRequired = isShipmentRequiredForCategory(category);
  if (shipmentRequired && !shipmentId && !trackingNumber) {
    return res.status(400).json({
      error: 'Please select an affected shipment or enter a manual tracking ID for this issue category.',
    });
  }

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
    notice: 'Support request logged in ParcelPath Support Desk under your account.',
  });
});

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
app.get('/api/config/support', (_req: Request, res: Response) => {
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

// JSON 404 handler for all unmatched API routes
app.all('/api/*', (req: Request, res: Response) => {
  return res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

// --- Production / Dev Server Mounting ---
async function startServer() {
  await db.initAsync();
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
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ParcelPath server listening on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
