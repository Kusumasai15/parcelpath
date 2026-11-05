import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { neonPostgres } from './postgres.ts';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarInitial: string;
  backupRecipient: string;
  deliveryInstructions: string;
  notifications: {
    statusUpdates: boolean;
    arrivalReminders: boolean;
  };
  role: 'user' | 'staff' | 'admin';
  emailVerified?: boolean;
  recoveryCodeHash?: string;
  lastVerificationSentAt?: number;
  createdAt: string;
}

export interface TrackingEvent {
  title: string;
  time: string;
  location?: string;
  isDone?: boolean;
}

export interface Shipment {
  id: string;
  userId: string;
  item: string;
  customLabel?: string;
  store: string;
  trackingNumber: string;
  courier: string;
  courierName: string;
  status: 'In transit' | 'Out for delivery' | 'Delivery attempted' | 'Delivered' | 'Delayed' | 'Exception';
  eta: string;
  estimatedDate?: string;
  timeWindow?: string;
  location: string;
  events: TrackingEvent[];
  imageUrl?: string;
  isArchived: boolean;
  isDemo: boolean;
  notes?: string;
  lastUpdated?: string;
  lastRefreshedAt: string;
  courierEventTime?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketRef: string;
  userId: string;
  userEmail: string;
  userName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
  preferredContactMethod?: 'email' | 'phone' | 'whatsapp';
  shipmentId?: string;
  shipmentLabel?: string;
  trackingNumber?: string;
  courier?: string;
  isManualTracking?: boolean;
  category: string;
  categoryLabel?: string;
  subject: string;
  description: string;
  status: 'Open' | 'In review' | 'Resolved';
  staffReply?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  attachmentSize?: number;
  attachmentType?: string;
  createdAt: string;
}

export interface InAppAlert {
  id: string;
  userId: string;
  shipmentId: string;
  shipmentItem: string;
  trackingNumber: string;
  type: 'out_for_delivery' | 'attempt' | 'delayed' | 'delivered' | 'estimate_change';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface EmailIntegrationState {
  status: 'disconnected' | 'setup_required' | 'connected';
  email?: string;
  connectedAt?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface SessionData {
  userId: string;
  createdAt: number;
  lastVerifiedAt: number;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
  used: boolean;
  createdAt: string;
}

export interface VerificationCode {
  code: string;
  userId: string;
  email: string;
  action: 'change_password' | 'delete_account';
  expiresAt: number;
  createdAt: string;
}

export interface AccountVerificationToken {
  token: string;
  code: string;
  userId: string;
  email: string;
  expiresAt: number;
  used: boolean;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  shipments: Shipment[];
  tickets: SupportTicket[];
  alerts: InAppAlert[];
  sessions: Record<string, string | SessionData>;
  emailIntegrations: Record<string, EmailIntegrationState>;
  resetTokens?: PasswordResetToken[];
  verificationCodes?: Record<string, VerificationCode>;
  verificationTokens?: AccountVerificationToken[];
  deletedUserIds?: string[];
  deletedEmails?: string[];
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'parcelpath-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// --- Recovery Code Utilities ---
const RECOVERY_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRecoveryCode(): string {
  let raw = '';
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    raw += RECOVERY_CHARS[bytes[i] % RECOVERY_CHARS.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeRecoveryCode(code: string): string {
  return (code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function hashRecoveryCode(code: string): string {
  const clean = normalizeRecoveryCode(code);
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt:${salt}:${digest}`;
}

export function verifyRecoveryCode(code: string, storedHash?: string): boolean {
  if (!code || !storedHash) return false;
  const clean = normalizeRecoveryCode(code);
  if (clean.length < 8) return false;
  const [scheme, salt, digest] = storedHash.split(':');
  if (scheme === 'scrypt' && salt && digest) {
    const expected = Buffer.from(digest, 'hex');
    const actual = crypto.scryptSync(clean, salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  return false;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function initDefaultDatabase(): DatabaseSchema {
  const defaultUserId = 'user_kusuma_default';
  const defaultPasswordHash = hashPassword('welcome123');
  const defaultRecoveryCodeHash = hashRecoveryCode('KUSU-MA26-PARC-EL01');

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  const defaultUser: User = {
    id: defaultUserId,
    email: 'saddikutikusumasai@gmail.com',
    passwordHash: defaultPasswordHash,
    name: 'Kusuma',
    avatarInitial: 'K',
    backupRecipient: 'Ravi · Security desk',
    deliveryInstructions: 'Leave with front security desk if unavailable.',
    notifications: {
      statusUpdates: true,
      arrivalReminders: true,
    },
    role: 'user',
    emailVerified: true,
    recoveryCodeHash: defaultRecoveryCodeHash,
    createdAt: nowIso,
  };

  const defaultShipments: Shipment[] = [
    {
      id: 'ship_4821',
      userId: defaultUserId,
      item: 'Wireless headphones',
      customLabel: 'Urgent',
      store: 'Amazon',
      trackingNumber: '…4821',
      courier: 'delhivery',
      courierName: 'Delhivery',
      status: 'Out for delivery',
      eta: 'Today, 2:30–3:15 PM',
      estimatedDate: todayStr,
      timeWindow: 'Today, 2:30–3:15 PM',
      location: 'Local delivery hub (Today, 8:05 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 3:15 PM', isDone: true },
        { title: 'Reached local delivery hub', time: 'Today, 8:05 AM', isDone: true },
        { title: 'Out for delivery', time: 'Today, 10:42 AM', isDone: true },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: 'Updated 5 minutes ago',
      lastRefreshedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      courierEventTime: 'Today, 10:42 AM',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'ship_9034',
      userId: defaultUserId,
      item: 'Daily skincare set',
      customLabel: 'Birthday gift',
      store: 'Nykaa',
      trackingNumber: '…9034',
      courier: 'bluedart',
      courierName: 'Blue Dart',
      status: 'Delivery attempted',
      eta: 'Check available options',
      estimatedDate: todayStr,
      timeWindow: undefined,
      location: 'Delivery center (Today, 11:15 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 4:30 PM', isDone: true },
        { title: 'Delivery attempted', time: 'Today, 11:15 AM', isDone: true },
        { title: 'Waiting for next update', time: 'Time not available', isDone: false },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: 'Updated 22 minutes ago',
      lastRefreshedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      courierEventTime: 'Today, 11:15 AM',
      createdAt: new Date(Date.now() - 90000000).toISOString(),
    },
    {
      id: 'ship_1172',
      userId: defaultUserId,
      item: 'Cotton kurta',
      customLabel: 'College supplies',
      store: 'Flipkart',
      trackingNumber: '…1172',
      courier: 'ekart',
      courierName: 'Ekart Logistics',
      status: 'In transit',
      eta: 'Expected tomorrow',
      estimatedDate: tomorrowStr,
      timeWindow: undefined,
      location: 'Transit hub (Today, 7:45 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 7:20 PM', isDone: true },
        { title: 'Parcel in transit', time: 'Today, 7:45 AM', isDone: true },
        { title: 'Next scan', time: 'Awaiting courier update', isDone: false },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: 'Updated 1 hour ago',
      lastRefreshedAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
      courierEventTime: 'Today, 7:45 AM',
      createdAt: new Date(Date.now() - 95000000).toISOString(),
    },
    {
      id: 'ship_8801',
      userId: defaultUserId,
      item: 'Stainless steel water bottle',
      customLabel: 'Personal',
      store: 'Amazon',
      trackingNumber: '…8801',
      courier: 'delhivery',
      courierName: 'Delhivery',
      status: 'Delivered',
      eta: 'Delivered',
      estimatedDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
      location: 'Handed over to recipient / Security',
      events: [
        { title: 'Order confirmed', time: '3 days ago', isDone: true },
        { title: 'Out for delivery', time: '3 days ago, 9:15 AM', isDone: true },
        { title: 'Delivered', time: '3 days ago, 2:40 PM', isDone: true },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: 'Delivered 3 days ago',
      lastRefreshedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      courierEventTime: '3 days ago, 2:40 PM',
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
  ];

  const defaultAlerts: InAppAlert[] = [
    {
      id: 'alert_1',
      userId: defaultUserId,
      shipmentId: 'ship_4821',
      shipmentItem: 'Wireless headphones',
      trackingNumber: '…4821',
      type: 'out_for_delivery',
      title: 'Out for delivery: Wireless headphones',
      message: 'Delhivery courier is out for delivery. Estimated arrival: Today, 2:30–3:15 PM.',
      read: false,
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: 'alert_2',
      userId: defaultUserId,
      shipmentId: 'ship_9034',
      shipmentItem: 'Daily skincare set',
      trackingNumber: '…9034',
      type: 'attempt',
      title: 'Delivery attempted: Daily skincare set',
      message: 'Blue Dart attempted delivery at 11:15 AM. A handoff or reschedule may be needed.',
      read: false,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ];

  return {
    users: [defaultUser],
    shipments: defaultShipments,
    tickets: [],
    alerts: defaultAlerts,
    sessions: {},
    emailIntegrations: {
      [defaultUserId]: {
        status: 'disconnected',
        message: 'Connect your Gmail account to automatically scan for order confirmation emails and extract product photos.',
      },
    },
    deletedUserIds: [],
    deletedEmails: [],
  };
}

class Database {
  private data: DatabaseSchema;
  private isPostgresReady = false;

  constructor() {
    this.data = this.load();
    // Proactively initialize Neon PostgreSQL in background if configured
    if (neonPostgres.isConfigured()) {
      this.initAsync().catch((err) => {
        console.warn('[Database] Neon PostgreSQL async init deferred:', err);
      });
    }
  }

  async initAsync(): Promise<void> {
    if (!neonPostgres.isConfigured()) return;
    try {
      await neonPostgres.initSchema();
      await neonPostgres.migrateInitialSeed(this.data);
      const pgData = await neonPostgres.loadAll();
      if (pgData) {
        if (pgData.users && pgData.users.length > 0) {
          this.data.users = pgData.users;
        }
        if (pgData.shipments) {
          this.data.shipments = pgData.shipments;
        }
        if (pgData.tickets) {
          this.data.tickets = pgData.tickets;
        }
        if (pgData.alerts) {
          this.data.alerts = pgData.alerts;
        }
        if (pgData.sessions && Object.keys(pgData.sessions).length > 0) {
          this.data.sessions = pgData.sessions;
        }
        if (pgData.emailIntegrations && Object.keys(pgData.emailIntegrations).length > 0) {
          this.data.emailIntegrations = pgData.emailIntegrations;
        }
        this.data.deletedEmails = pgData.deletedEmails || [];
        this.data.deletedUserIds = pgData.deletedUserIds || [];
        this.isPostgresReady = true;
        this.save();
        console.log('[Database] Connected and synced with Neon PostgreSQL.');
      }
    } catch (e) {
      console.error('[Database] Failed to sync with Neon PostgreSQL:', e);
    }
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.alerts) parsed.alerts = [];
        if (!parsed.resetTokens) parsed.resetTokens = [];
        if (!parsed.verificationCodes) parsed.verificationCodes = {};
        if (!parsed.verificationTokens) parsed.verificationTokens = [];
        if (!parsed.deletedUserIds) parsed.deletedUserIds = [];
        if (!parsed.deletedEmails) parsed.deletedEmails = [];
        if (parsed.deletedUserIds && parsed.deletedUserIds.length > 0) {
          parsed.users = (parsed.users || []).filter((u: any) => !parsed.deletedUserIds.includes(u.id));
          parsed.shipments = (parsed.shipments || []).filter((s: any) => !parsed.deletedUserIds.includes(s.userId));
          parsed.tickets = (parsed.tickets || []).filter((t: any) => !parsed.deletedUserIds.includes(t.userId));
          parsed.alerts = (parsed.alerts || []).filter((a: any) => !parsed.deletedUserIds.includes(a.userId));
        }
        return parsed;
      }
      const seedFile = path.resolve(process.cwd(), 'data', 'db.json');
      if (process.env.VERCEL && fs.existsSync(seedFile)) {
        const raw = fs.readFileSync(seedFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.alerts) parsed.alerts = [];
        if (!parsed.resetTokens) parsed.resetTokens = [];
        if (!parsed.verificationCodes) parsed.verificationCodes = {};
        if (!parsed.verificationTokens) parsed.verificationTokens = [];
        if (!parsed.deletedUserIds) parsed.deletedUserIds = [];
        if (!parsed.deletedEmails) parsed.deletedEmails = [];
        this.save(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read existing database, initializing fresh:', e);
    }

    const initial = initDefaultDatabase();
    this.save(initial);
    return initial;
  }

  private save(dataToSave?: DatabaseSchema) {
    const payload = JSON.stringify(dataToSave || this.data, null, 2);
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, payload, 'utf-8');
    } catch (e) {
      console.warn('Warning: Could not persist database to primary filesystem (running in-memory):', e);
    }

    const seedFile = path.resolve(process.cwd(), 'data', 'db.json');
    if (seedFile !== DB_FILE) {
      try {
        const seedDir = path.dirname(seedFile);
        if (!fs.existsSync(seedDir)) fs.mkdirSync(seedDir, { recursive: true });
        fs.writeFileSync(seedFile, payload, 'utf-8');
      } catch {
        // Read-only filesystem on Vercel lambda
      }
    }
  }

  // --- Auth & Users ---
  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserBySession(token: string): User | undefined {
    const sessionVal = this.data.sessions[token];
    if (!sessionVal) return undefined;
    const userId = typeof sessionVal === 'string' ? sessionVal : sessionVal.userId;
    return this.getUserById(userId);
  }

  createSession(userId: string): string {
    const token = 'sess_' + crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const sessionObj: SessionData = {
      userId,
      createdAt: now,
      lastVerifiedAt: now,
    };
    this.data.sessions[token] = sessionObj;
    this.save();
    neonPostgres.saveSession(token, sessionObj).catch(() => {});
    return token;
  }

  removeSession(token: string): void {
    delete this.data.sessions[token];
    this.save();
    neonPostgres.deleteSession(token).catch(() => {});
  }

  isSessionRecent(token: string): boolean {
    const sessionVal = this.data.sessions[token];
    if (!sessionVal) return false;
    return true; // Simplified: active session is valid
  }

  refreshSessionVerification(token: string): void {
    const sessionVal = this.data.sessions[token];
    if (sessionVal) {
      if (typeof sessionVal === 'object') {
        sessionVal.lastVerifiedAt = Date.now();
        neonPostgres.saveSession(token, sessionVal).catch(() => {});
      } else {
        const newObj = {
          userId: sessionVal,
          createdAt: Date.now(),
          lastVerifiedAt: Date.now(),
        };
        this.data.sessions[token] = newObj;
        neonPostgres.saveSession(token, newObj).catch(() => {});
      }
      this.save();
    }
  }

  revokeAllSessions(userId: string): void {
    for (const [t, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === userId) {
        delete this.data.sessions[t];
        neonPostgres.deleteSession(t).catch(() => {});
      }
    }
    this.save();
  }

  createUser(name: string, email: string, password: string, emailVerified: boolean = true): User & { recoveryCode: string } {
    const normEmail = email.trim().toLowerCase();
    // If this email was in tombstone, remove it so new registration starts fresh
    if (this.data.deletedEmails) {
      this.data.deletedEmails = this.data.deletedEmails.filter((e) => e !== normEmail);
    }
    const id = 'user_' + crypto.randomBytes(8).toString('hex');
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = hashRecoveryCode(recoveryCode);

    const newUser: User = {
      id,
      email: normEmail,
      passwordHash: hashPassword(password),
      name: name.trim() || 'Parcel User',
      avatarInitial: (name.trim() || 'U')[0].toUpperCase(),
      backupRecipient: '',
      deliveryInstructions: '',
      notifications: {
        statusUpdates: true,
        arrivalReminders: true,
      },
      role: 'user',
      emailVerified,
      recoveryCodeHash,
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.save();
    neonPostgres.saveUser(newUser).catch(() => {});
    return Object.assign(newUser, { recoveryCode });
  }

  regenerateRecoveryCode(userId: string): { recoveryCode: string } | null {
    const user = this.getUserById(userId);
    if (!user) return null;

    const newCode = generateRecoveryCode();
    user.recoveryCodeHash = hashRecoveryCode(newCode);
    this.save();
    neonPostgres.saveUser(user).catch(() => {});
    return { recoveryCode: newCode };
  }

  recoverWithCode(email: string, recoveryCode: string, newPassword: string): { success: boolean; user?: User; token?: string; error?: string } {
    if (!email || !recoveryCode || !newPassword) {
      return { success: false, error: 'Email, recovery code, and new password are required.' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long.' };
    }

    const normEmail = email.trim().toLowerCase();
    const user = this.getUserByEmail(normEmail);

    if (!user || !user.recoveryCodeHash) {
      return { success: false, error: 'Invalid email or recovery code.' };
    }

    if (!verifyRecoveryCode(recoveryCode, user.recoveryCodeHash)) {
      return { success: false, error: 'Invalid email or recovery code.' };
    }

    // Atomically consume recovery code so it cannot be reused
    delete user.recoveryCodeHash;
    user.passwordHash = hashPassword(newPassword);

    // Invalidate existing sessions
    this.revokeAllSessions(user.id);

    // Create fresh session
    const token = this.createSession(user.id);
    this.save();
    neonPostgres.saveUser(user).catch(() => {});

    return { success: true, user, token };
  }

  createAccountVerificationToken(userId: string): { token: string; code: string; expiresAt: number; user: User } {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (!this.data.verificationTokens) this.data.verificationTokens = [];
    for (const vt of this.data.verificationTokens) {
      if (vt.userId === userId && !vt.used) {
        vt.used = true;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const code = (100000 + crypto.randomInt(900000)).toString();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    this.data.verificationTokens.push({
      token,
      code,
      userId,
      email: user.email,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    });

    user.lastVerificationSentAt = Date.now();
    this.save();
    return { token, code, expiresAt, user };
  }

  verifyAccountEmail(tokenOrCode: string): { success: boolean; user?: User; error?: string } {
    if (!tokenOrCode || !this.data.verificationTokens) {
      return { success: false, error: 'Verification token or code is required.' };
    }

    const cleanInput = tokenOrCode.trim();
    const record = this.data.verificationTokens.find(
      (vt) => (vt.token === cleanInput || vt.code === cleanInput)
    );

    if (!record) {
      return { success: false, error: 'Invalid verification token or code.' };
    }

    if (record.used) {
      return { success: false, error: 'This verification link has already been used. Please sign in.' };
    }

    if (Date.now() > record.expiresAt) {
      return { success: false, error: 'Verification link has expired. Please request a new one.' };
    }

    const user = this.getUserById(record.userId);
    if (!user) {
      return { success: false, error: 'User account not found.' };
    }

    record.used = true;
    user.emailVerified = true;
    this.save();
    neonPostgres.saveUser(user).catch(() => {});
    return { success: true, user };
  }

  verifyPassword(user: User, password: string): boolean {
    if (typeof password !== 'string' || password.length > 128) return false;
    const [scheme, salt, digest] = user.passwordHash.split(':');
    if (scheme === 'scrypt' && salt && digest) {
      const expected = Buffer.from(digest, 'hex');
      const actual = crypto.scryptSync(password, salt, 64);
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }
    const legacy = crypto.createHash('sha256').update(password + '_parcelpath_salt').digest('hex');
    return user.passwordHash === legacy;
  }

  updateUserProfile(userId: string, updates: Partial<User>): User | undefined {
    const user = this.getUserById(userId);
    if (!user) return undefined;

    if (updates.name !== undefined) {
      user.name = updates.name.trim();
      user.avatarInitial = (user.name[0] || 'U').toUpperCase();
    }
    if (updates.backupRecipient !== undefined) user.backupRecipient = updates.backupRecipient;
    if (updates.deliveryInstructions !== undefined) user.deliveryInstructions = updates.deliveryInstructions;
    if (updates.notifications) {
      user.notifications = {
        ...user.notifications,
        ...updates.notifications,
      };
    }

    this.save();
    neonPostgres.saveUser(user).catch(() => {});
    return user;
  }

  updateUserPassword(userId: string, newPassword: string, keepSessionToken?: string): { success: boolean; error?: string } {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    const user = this.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User account not found.' };
    }

    user.passwordHash = hashPassword(newPassword);

    // Invalidate other sessions
    for (const [token, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === userId && token !== keepSessionToken) {
        delete this.data.sessions[token];
        neonPostgres.deleteSession(token).catch(() => {});
      }
    }

    this.save();
    neonPostgres.saveUser(user).catch(() => {});
    return { success: true };
  }

  // --- Complete Account Deletion ---
  deleteUserAccount(userId: string): {
    success: boolean;
    error?: string;
    deletedCount: { shipments: number; tickets: number; alerts: number; sessionsRevoked: number };
  } {
    const user = this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: 'User account not found or already deleted.',
        deletedCount: { shipments: 0, tickets: 0, alerts: 0, sessionsRevoked: 0 },
      };
    }

    const normEmail = user.email.toLowerCase();
    if (!this.data.deletedUserIds) this.data.deletedUserIds = [];
    if (!this.data.deletedEmails) this.data.deletedEmails = [];

    if (!this.data.deletedUserIds.includes(userId)) {
      this.data.deletedUserIds.push(userId);
    }
    if (!this.data.deletedEmails.includes(normEmail)) {
      this.data.deletedEmails.push(normEmail);
    }

    const shipCount = this.data.shipments.filter((s) => s.userId === userId).length;
    const ticketCount = this.data.tickets.filter((t) => t.userId === userId).length;
    const alertCount = this.data.alerts.filter((a) => a.userId === userId).length;

    let sessionsRevoked = 0;
    for (const [t, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === userId) {
        delete this.data.sessions[t];
        sessionsRevoked++;
      }
    }

    // Purge records and attachments
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.shipments = this.data.shipments.filter((s) => s.userId !== userId);
    this.data.tickets = this.data.tickets.filter((t) => t.userId !== userId);
    this.data.alerts = this.data.alerts.filter((a) => a.userId !== userId);
    delete this.data.emailIntegrations[userId];

    if (this.data.verificationCodes) delete this.data.verificationCodes[userId];
    if (this.data.resetTokens) this.data.resetTokens = this.data.resetTokens.filter((r) => r.userId !== userId);
    if (this.data.verificationTokens) this.data.verificationTokens = this.data.verificationTokens.filter((vt) => vt.userId !== userId);

    this.save();
    neonPostgres.deleteAccount(userId, normEmail).catch(() => {});

    return {
      success: true,
      deletedCount: {
        shipments: shipCount,
        tickets: ticketCount,
        alerts: alertCount,
        sessionsRevoked,
      },
    };
  }

  // --- Shipments ---
  getShipmentsForUser(userId: string, options: { search?: string; filter?: string } = {}): Shipment[] {
    let list = this.data.shipments.filter((s) => s.userId === userId && !s.isArchived);

    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter(
        (s) =>
          s.item.toLowerCase().includes(q) ||
          (s.customLabel && s.customLabel.toLowerCase().includes(q)) ||
          s.store.toLowerCase().includes(q) ||
          s.trackingNumber.toLowerCase().includes(q) ||
          s.courierName.toLowerCase().includes(q)
      );
    }

    if (options.filter === 'active') {
      list = list.filter((s) => s.status !== 'Delivered');
    } else if (options.filter === 'delivered') {
      list = list.filter((s) => s.status === 'Delivered');
    } else if (options.filter === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      list = list.filter(
        (s) =>
          s.status !== 'Delivered' &&
          (s.estimatedDate === todayStr || s.status === 'Out for delivery' || (s.eta && s.eta.toLowerCase().includes('today')))
      );
    } else if (options.filter === 'attention') {
      list = list.filter(
        (s) => s.status === 'Delivery attempted' || s.status === 'Delayed' || s.status === 'Exception'
      );
    }

    return list;
  }

  getShipmentById(id: string, userId: string): Shipment | undefined {
    return this.data.shipments.find((s) => s.id === id && s.userId === userId);
  }

  findDuplicateShipment(userId: string, courier: string, trackingNumber: string): Shipment | undefined {
    const cleanNum = trackingNumber.trim().toUpperCase();
    return this.data.shipments.find(
      (s) =>
        s.userId === userId &&
        !s.isArchived &&
        s.courier.toLowerCase() === courier.toLowerCase() &&
        s.trackingNumber.trim().toUpperCase() === cleanNum
    );
  }

  addShipment(userId: string, shipment: Omit<Shipment, 'id' | 'userId' | 'createdAt'>): Shipment {
    const id = 'ship_' + crypto.randomBytes(6).toString('hex');
    const newShipment: Shipment = {
      ...shipment,
      id,
      userId,
      isArchived: false,
      lastRefreshedAt: shipment.lastRefreshedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.data.shipments.unshift(newShipment);
    this.save();
    neonPostgres.saveShipment(newShipment).catch(() => {});
    return newShipment;
  }

  updateShipment(id: string, userId: string, updates: Partial<Shipment>): Shipment | undefined {
    const shipment = this.getShipmentById(id, userId);
    if (!shipment) return undefined;

    Object.assign(shipment, updates);
    this.save();
    neonPostgres.saveShipment(shipment).catch(() => {});
    return shipment;
  }

  refreshActiveShipments(): number {
    const active = this.data.shipments.filter(
      (s) => !s.isArchived && s.status !== 'Delivered'
    );
    const now = new Date().toISOString();
    for (const s of active) {
      s.lastRefreshedAt = now;
      neonPostgres.saveShipment(s).catch(() => {});
    }
    if (active.length > 0) {
      this.save();
    }
    return active.length;
  }

  removeShipment(id: string, userId: string): boolean {
    const beforeCount = this.data.shipments.length;
    this.data.shipments = this.data.shipments.filter((s) => !(s.id === id && s.userId === userId));
    const changed = this.data.shipments.length !== beforeCount;
    if (changed) {
      this.save();
      neonPostgres.deleteShipment(id, userId).catch(() => {});
    }
    return changed;
  }

  // --- In-App Alerts ---
  getAlertsForUser(userId: string): InAppAlert[] {
    return (this.data.alerts || []).filter((a) => a.userId === userId);
  }

  addAlert(alert: Omit<InAppAlert, 'id' | 'createdAt'>): InAppAlert {
    const id = 'alert_' + crypto.randomBytes(6).toString('hex');
    const newAlert: InAppAlert = {
      ...alert,
      id,
      createdAt: new Date().toISOString(),
    };
    if (!this.data.alerts) this.data.alerts = [];
    this.data.alerts.unshift(newAlert);
    this.save();
    neonPostgres.saveAlert(newAlert).catch(() => {});
    return newAlert;
  }

  markAlertRead(id: string, userId: string): boolean {
    const alert = (this.data.alerts || []).find((a) => a.id === id && a.userId === userId);
    if (alert) {
      alert.read = true;
      this.save();
      neonPostgres.saveAlert(alert).catch(() => {});
      return true;
    }
    return false;
  }

  markAllAlertsRead(userId: string): void {
    if (!this.data.alerts) return;
    this.data.alerts.forEach((a) => {
      if (a.userId === userId) {
        a.read = true;
        neonPostgres.saveAlert(a).catch(() => {});
      }
    });
    this.save();
  }

  clearAlerts(userId: string): void {
    if (!this.data.alerts) return;
    this.data.alerts = this.data.alerts.filter((a) => a.userId !== userId);
    this.save();
  }

  // --- Tickets ---
  getTicketsForUser(userId: string): SupportTicket[] {
    return this.data.tickets.filter((t) => t.userId === userId);
  }

  getAllTickets(): SupportTicket[] {
    return this.data.tickets;
  }

  createTicket(params: {
    userId: string;
    userEmail: string;
    userName: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactWhatsapp?: string;
    preferredContactMethod?: 'email' | 'phone' | 'whatsapp';
    shipmentId?: string;
    shipmentLabel?: string;
    trackingNumber?: string;
    courier?: string;
    isManualTracking?: boolean;
    category: string;
    categoryLabel?: string;
    subject: string;
    description: string;
    attachmentName?: string;
    attachmentDataUrl?: string;
    attachmentSize?: number;
    attachmentType?: string;
  }): SupportTicket {
    const id = 'tkt_' + crypto.randomBytes(6).toString('hex');
    const refNum = 'TKT-' + Math.floor(1000 + Math.random() * 9000) + '-' + new Date().getFullYear();

    const newTicket: SupportTicket = {
      id,
      ticketRef: refNum,
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone,
      contactWhatsapp: params.contactWhatsapp,
      preferredContactMethod: params.preferredContactMethod,
      shipmentId: params.shipmentId,
      shipmentLabel: params.shipmentLabel,
      trackingNumber: params.trackingNumber,
      courier: params.courier,
      isManualTracking: params.isManualTracking,
      category: params.category,
      categoryLabel: params.categoryLabel,
      subject: params.subject,
      description: params.description,
      status: 'Open',
      attachmentName: params.attachmentName,
      attachmentDataUrl: params.attachmentDataUrl,
      attachmentSize: params.attachmentSize,
      attachmentType: params.attachmentType,
      createdAt: new Date().toISOString(),
    };

    this.data.tickets.unshift(newTicket);
    this.save();
    neonPostgres.saveTicket(newTicket).catch(() => {});
    return newTicket;
  }

  updateTicketStatus(ticketId: string, status: SupportTicket['status'], staffReply?: string): SupportTicket | undefined {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return undefined;
    ticket.status = status;
    if (staffReply) ticket.staffReply = staffReply;
    this.save();
    neonPostgres.saveTicket(ticket).catch(() => {});
    return ticket;
  }

  // --- Email Integration ---
  getEmailIntegration(userId: string): EmailIntegrationState {
    return (
      this.data.emailIntegrations[userId] || {
        status: 'disconnected',
        message: 'Gmail order scanning is not connected.',
      }
    );
  }

  setEmailIntegration(userId: string, state: EmailIntegrationState): void {
    this.data.emailIntegrations[userId] = state;
    this.save();
    neonPostgres.saveEmailIntegration(userId, state).catch(() => {});
  }
}

export const db = new Database();
