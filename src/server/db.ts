import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
  sessions: Record<string, string | SessionData>; // token -> userId or SessionData
  emailIntegrations: Record<string, EmailIntegrationState>; // userId -> state
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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function initDefaultDatabase(): DatabaseSchema {
  const defaultUserId = 'user_kusuma_default';
  const defaultPasswordHash = hashPassword('welcome123');

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
      timeWindow: undefined, // Time not available
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
    // Completed delivery for delivery history
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
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
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
        if (parsed.deletedUserIds && parsed.deletedUserIds.length > 0) {
          parsed.users = (parsed.users || []).filter((u: any) => !parsed.deletedUserIds.includes(u.id));
          parsed.shipments = (parsed.shipments || []).filter((s: any) => !parsed.deletedUserIds.includes(s.userId));
          parsed.tickets = (parsed.tickets || []).filter((t: any) => !parsed.deletedUserIds.includes(t.userId));
          parsed.alerts = (parsed.alerts || []).filter((a: any) => !parsed.deletedUserIds.includes(a.userId));
        }
        return parsed;
      }
      // On Vercel, if /tmp doesn't have the db yet, check if project seed exists
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
        if (parsed.deletedUserIds && parsed.deletedUserIds.length > 0) {
          parsed.users = (parsed.users || []).filter((u: any) => !parsed.deletedUserIds.includes(u.id));
          parsed.shipments = (parsed.shipments || []).filter((s: any) => !parsed.deletedUserIds.includes(s.userId));
          parsed.tickets = (parsed.tickets || []).filter((t: any) => !parsed.deletedUserIds.includes(t.userId));
          parsed.alerts = (parsed.alerts || []).filter((a: any) => !parsed.deletedUserIds.includes(a.userId));
        }
        this.save(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read existing database, initializing fresh:', e);
    }

    const initial = initDefaultDatabase();
    initial.resetTokens = [];
    initial.verificationCodes = {};
    initial.verificationTokens = [];
    initial.deletedUserIds = [];
    initial.deletedEmails = [];
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
        // Ignored in read-only environments
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
    this.data.sessions[token] = {
      userId,
      createdAt: now,
      lastVerifiedAt: now,
    };
    this.save();
    return token;
  }

  removeSession(token: string): void {
    delete this.data.sessions[token];
    this.save();
  }

  isSessionRecent(token: string): boolean {
    const sessionVal = this.data.sessions[token];
    if (!sessionVal) return false;
    if (typeof sessionVal === 'string') {
      return false; // Legacy session requires fresh re-verification
    }
    // Consider recent if authenticated or verified within 15 minutes
    return (Date.now() - sessionVal.lastVerifiedAt) < 15 * 60 * 1000;
  }

  refreshSessionVerification(token: string): void {
    const sessionVal = this.data.sessions[token];
    if (sessionVal) {
      if (typeof sessionVal === 'object') {
        sessionVal.lastVerifiedAt = Date.now();
      } else {
        this.data.sessions[token] = {
          userId: sessionVal,
          createdAt: Date.now(),
          lastVerifiedAt: Date.now(),
        };
      }
      this.save();
    }
  }

  revokeAllSessions(userId: string): void {
    for (const [t, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === userId) {
        delete this.data.sessions[t];
      }
    }
    this.save();
  }

  createUser(name: string, email: string, password: string, emailVerified: boolean = false): User {
    const normEmail = email.trim().toLowerCase();
    // If this email was previously deleted, remove from tombstone so new account starts fresh
    if (this.data.deletedEmails) {
      this.data.deletedEmails = this.data.deletedEmails.filter((e) => e !== normEmail);
    }
    const id = 'user_' + crypto.randomBytes(8).toString('hex');
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
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  createAccountVerificationToken(userId: string): { token: string; code: string; expiresAt: number; user: User } {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (!this.data.verificationTokens) this.data.verificationTokens = [];

    // Invalidate prior unused tokens for this user
    for (const vt of this.data.verificationTokens) {
      if (vt.userId === userId && !vt.used) {
        vt.used = true;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const code = (100000 + crypto.randomInt(900000)).toString();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

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
    // Keep existing accounts usable while upgrading passwords on change.
    const legacy = crypto.createHash('sha256').update(password + '_parcelpath_salt').digest('hex');
    return user.passwordHash === legacy;
  }

  changePassword(userId: string, password: string): void {
    const user = this.getUserById(userId);
    if (!user) throw new Error('Account not found.');
    const passwordHash = hashPassword(password);
    user.passwordHash = passwordHash;
    for (const [token, id] of Object.entries(this.data.sessions)) {
      if (id === userId) delete this.data.sessions[token];
    }
    this.save();
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
    return user;
  }

  // --- Password Recovery & Security ---
  createPasswordResetToken(email: string): { token: string; user: User; expiresAt: number } | null {
    const normEmail = email.trim().toLowerCase();
    const user = this.getUserByEmail(normEmail);
    if (!user) return null;

    if (!this.data.resetTokens) this.data.resetTokens = [];

    // Invalidate existing unused tokens for this user
    for (const rt of this.data.resetTokens) {
      if (rt.userId === user.id && !rt.used) {
        rt.used = true;
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    this.data.resetTokens.push({
      token,
      userId: user.id,
      email: user.email,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    });

    this.save();
    return { token, user, expiresAt };
  }

  verifyPasswordResetToken(token: string): { valid: boolean; reason?: string; email?: string } {
    if (!token || !this.data.resetTokens) {
      return { valid: false, reason: 'Missing or invalid password reset token.' };
    }

    const record = this.data.resetTokens.find((r) => r.token === token);
    if (!record) {
      return { valid: false, reason: 'Invalid password reset link. Please request a new one.' };
    }

    if (record.used) {
      return { valid: false, reason: 'This password reset link has already been used. Please request a new one.' };
    }

    if (Date.now() > record.expiresAt) {
      return { valid: false, reason: 'This password reset link has expired. Reset links are valid for 1 hour.' };
    }

    const user = this.getUserById(record.userId);
    if (!user) {
      return { valid: false, reason: 'Associated user account no longer exists.' };
    }

    return { valid: true, email: user.email };
  }

  consumePasswordReset(token: string, newPassword: string): { success: boolean; error?: string } {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    const verification = this.verifyPasswordResetToken(token);
    if (!verification.valid) {
      return { success: false, error: verification.reason };
    }

    const record = this.data.resetTokens!.find((r) => r.token === token)!;
    const user = this.getUserById(record.userId);
    if (!user) {
      return { success: false, error: 'User account not found.' };
    }

    // Update password hash
    user.passwordHash = hashPassword(newPassword);
    record.used = true;

    // Invalidate ALL existing sessions for this user so old logins are terminated
    this.revokeAllSessions(user.id);

    this.save();
    return { success: true };
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
      }
    }

    this.save();
    return { success: true };
  }

  createVerificationCode(userId: string, action: 'change_password' | 'delete_account'): { code: string; email: string } {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found');

    if (!this.data.verificationCodes) this.data.verificationCodes = {};

    const code = (100000 + crypto.randomInt(900000)).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    this.data.verificationCodes[userId] = {
      code,
      userId,
      email: user.email,
      action,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this.save();
    return { code, email: user.email };
  }

  verifyCode(userId: string, code: string, action: 'change_password' | 'delete_account'): boolean {
    if (!this.data.verificationCodes || !this.data.verificationCodes[userId]) {
      return false;
    }

    const record = this.data.verificationCodes[userId];
    if (record.action !== action || record.code !== code.trim() || Date.now() > record.expiresAt) {
      return false;
    }

    delete this.data.verificationCodes[userId];
    this.save();
    return true;
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

    if (!this.data.deletedUserIds) this.data.deletedUserIds = [];
    if (!this.data.deletedEmails) this.data.deletedEmails = [];

    // Tombstone user so seed never resurrects this account
    if (!this.data.deletedUserIds.includes(userId)) {
      this.data.deletedUserIds.push(userId);
    }
    if (!this.data.deletedEmails.includes(user.email.toLowerCase())) {
      this.data.deletedEmails.push(user.email.toLowerCase());
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

    // Purge all records belonging to this user
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.shipments = this.data.shipments.filter((s) => s.userId !== userId);
    this.data.tickets = this.data.tickets.filter((t) => t.userId !== userId);
    this.data.alerts = this.data.alerts.filter((a) => a.userId !== userId);
    delete this.data.emailIntegrations[userId];

    if (this.data.verificationCodes) {
      delete this.data.verificationCodes[userId];
    }
    if (this.data.resetTokens) {
      this.data.resetTokens = this.data.resetTokens.filter((r) => r.userId !== userId);
    }
    if (this.data.verificationTokens) {
      this.data.verificationTokens = this.data.verificationTokens.filter((vt) => vt.userId !== userId);
    }

    this.save();
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

  deleteUser(userId: string): boolean {
    return this.deleteUserAccount(userId).success;
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
    return newShipment;
  }

  updateShipment(id: string, userId: string, updates: Partial<Shipment>): Shipment | undefined {
    const shipment = this.getShipmentById(id, userId);
    if (!shipment) return undefined;

    Object.assign(shipment, updates);
    this.save();
    return shipment;
  }

  refreshActiveShipments(): number {
    const active = this.data.shipments.filter(
      (s) => !s.isArchived && s.status !== 'Delivered'
    );
    const now = new Date().toISOString();
    for (const s of active) {
      s.lastRefreshedAt = now;
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
    if (changed) this.save();
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
    return newAlert;
  }

  markAlertRead(id: string, userId: string): boolean {
    const alert = (this.data.alerts || []).find((a) => a.id === id && a.userId === userId);
    if (alert) {
      alert.read = true;
      this.save();
      return true;
    }
    return false;
  }

  markAllAlertsRead(userId: string): void {
    if (!this.data.alerts) return;
    this.data.alerts.forEach((a) => {
      if (a.userId === userId) a.read = true;
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
    return newTicket;
  }

  updateTicketStatus(ticketId: string, status: SupportTicket['status'], staffReply?: string): SupportTicket | undefined {
    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return undefined;
    ticket.status = status;
    if (staffReply) ticket.staffReply = staffReply;
    this.save();
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
  }
}

export const db = new Database();
