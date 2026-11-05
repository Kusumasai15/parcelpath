/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { neonPostgres } from './postgres.ts';

export interface TrackingEvent {
  title: string;
  time: string;
  isDone: boolean;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarInitial: string;
  backupRecipient?: string;
  deliveryInstructions?: string;
  notifications: {
    statusUpdates: boolean;
    arrivalReminders: boolean;
  };
  role: 'user' | 'staff' | 'admin';
  emailVerified?: boolean;
  recoveryCodeHash?: string;
  createdAt: string;
  lastVerificationSentAt?: number;
}

export interface Shipment {
  id: string;
  userId: string;
  item: string;
  customLabel?: string;
  store?: string;
  trackingNumber: string;
  courier: string;
  courierName: string;
  status: string;
  eta?: string;
  estimatedDate?: string;
  timeWindow?: string;
  location: string;
  events: TrackingEvent[];
  imageUrl?: string;
  isArchived: boolean;
  isDemo?: boolean;
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

export interface DatabaseSchema {
  users: User[];
  shipments: Shipment[];
  tickets: SupportTicket[];
  alerts: InAppAlert[];
  sessions: Record<string, SessionData | string>;
  emailIntegrations: Record<string, EmailIntegrationState>;
  deletedEmails?: string[];
  deletedUserIds?: string[];
  verificationCodes?: Record<string, { code: string; expiresAt: number }>;
  resetTokens?: Array<{ token: string; userId: string; email: string; expiresAt: number; used: boolean; createdAt: string }>;
  verificationTokens?: Array<{ token: string; code: string; userId: string; email: string; expiresAt: number; used: boolean; createdAt: string }>;
}

const DATA_DIR = process.env.VERCEL ? '/tmp/parcelpath-data' : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// --- Strong Recovery Code Utilities ---
export function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Base32 excluding confusing 0/O, 1/I
  const randomBytes = crypto.randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars[randomBytes[i] % chars.length];
    if ((i + 1) % 4 === 0 && i < 15) {
      code += '-';
    }
  }
  return code;
}

export function hashRecoveryCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyRecoveryCode(providedCode: string, storedHash: string): boolean {
  if (!providedCode || !storedHash) return false;
  const clean = providedCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const [scheme, salt, digest] = storedHash.split(':');
  if (scheme === 'scrypt' && salt && digest) {
    const expected = Buffer.from(digest, 'hex');
    const actual = crypto.scryptSync(clean, salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  return false;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(user: User, password: string): boolean {
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

function initDefaultDatabase(): DatabaseSchema {
  return {
    users: [],
    shipments: [],
    tickets: [],
    alerts: [],
    sessions: {},
    emailIntegrations: {},
    deletedEmails: [],
    deletedUserIds: [],
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
    if (neonPostgres.isConfigured()) {
      this.initAsync().catch((err) => {
        console.warn('[Database] Neon PostgreSQL async init deferred:', err);
      });
    }
  }

  isNeonActive(): boolean {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      return true;
    }
    return neonPostgres.isConfigured();
  }

  assertNeonReady(): void {
    if (!neonPostgres.isConfigured()) {
      throw new Error('Database service unavailable: Neon PostgreSQL DATABASE_URL must be configured in production.');
    }
  }

  async initAsync(): Promise<void> {
    if (!neonPostgres.isConfigured()) return;
    try {
      await neonPostgres.initSchema();
      console.log('[Database] Connected to Neon PostgreSQL.');
    } catch (e) {
      console.error('[Database] Failed to init Neon PostgreSQL schema:', e);
    }
  }

  private load(): DatabaseSchema {
    // In production or on Vercel, Neon PostgreSQL is the ONLY database.
    // Zero runtime use of db.json or /tmp storage.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      return initDefaultDatabase();
    }

    // Offline dev / testing fallback:
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read existing local database, initializing fresh:', e);
    }

    return initDefaultDatabase();
  }

  private save(dataToSave?: DatabaseSchema) {
    // In production or on Vercel, Neon PostgreSQL is the ONLY database.
    // Zero runtime use of db.json or /tmp storage.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      return;
    }

    const payload = JSON.stringify(dataToSave || this.data, null, 2);
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, payload, 'utf-8');
    } catch {
      // In-memory mode
    }
  }

  // --- Auth & Users ---
  async getUserById(id: string): Promise<User | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const u = await neonPostgres.getUserById(id);
      return u || undefined;
    }
    return this.data.users.find((u) => u.id === id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const u = await neonPostgres.getUserByEmail(email);
      return u || undefined;
    }
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async getUserBySession(token: string): Promise<User | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const u = await neonPostgres.getUserBySession(token);
      return u || undefined;
    }
    const sessionVal = this.data.sessions[token];
    if (!sessionVal) return undefined;
    const userId = typeof sessionVal === 'string' ? sessionVal : sessionVal.userId;
    return this.data.users.find((u) => u.id === userId);
  }

  verifyPassword(user: User, password: string): boolean {
    return verifyPassword(user, password);
  }

  async createSession(userId: string): Promise<string> {
    const token = 'sess_' + crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const sessionObj: SessionData = {
      userId,
      createdAt: now,
      lastVerifiedAt: now,
    };
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveSession(token, sessionObj);
      return token;
    }
    this.data.sessions[token] = sessionObj;
    this.save();
    return token;
  }

  async removeSession(token: string): Promise<void> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.deleteSession(token);
      return;
    }
    delete this.data.sessions[token];
    this.save();
  }

  async createUser(name: string, email: string, password: string, emailVerified = true): Promise<User & { recoveryCode: string }> {
    const normEmail = email.trim().toLowerCase();
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

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveUser(newUser);
      return Object.assign(newUser, { recoveryCode });
    }

    if (this.data.deletedEmails) {
      this.data.deletedEmails = this.data.deletedEmails.filter((e) => e !== normEmail);
    }
    this.data.users.push(newUser);
    this.save();
    return Object.assign(newUser, { recoveryCode });
  }

  async regenerateRecoveryCode(userId: string): Promise<{ recoveryCode: string } | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    const newCode = generateRecoveryCode();
    const hash = hashRecoveryCode(newCode);

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveUser({
        ...user,
        recoveryCodeHash: hash,
      });
      return { recoveryCode: newCode };
    }

    user.recoveryCodeHash = hash;
    this.save();
    return { recoveryCode: newCode };
  }

  async recoverWithCode(
    email: string,
    recoveryCode: string,
    newPassword: string
  ): Promise<{ success: boolean; user?: User; token?: string; error?: string }> {
    if (!email || !recoveryCode || !newPassword) {
      return { success: false, error: 'Email, recovery code, and new password are required.' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters long.' };
    }

    const normEmail = email.trim().toLowerCase();
    const user = await this.getUserByEmail(normEmail);

    if (!user || !user.recoveryCodeHash) {
      return { success: false, error: 'Invalid email or recovery code.' };
    }

    if (!verifyRecoveryCode(recoveryCode, user.recoveryCodeHash)) {
      return { success: false, error: 'Invalid email or recovery code.' };
    }

    const newHash = hashPassword(newPassword);

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveUser({
        ...user,
        passwordHash: newHash,
        recoveryCodeHash: null,
      });
      await neonPostgres.deleteAccountSessions(user.id);
      const token = await this.createSession(user.id);
      return {
        success: true,
        user: { ...user, passwordHash: newHash, recoveryCodeHash: undefined },
        token,
      };
    }

    delete user.recoveryCodeHash;
    user.passwordHash = newHash;
    for (const [t, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === user.id) {
        delete this.data.sessions[t];
      }
    }
    const token = await this.createSession(user.id);
    this.save();
    return { success: true, user, token };
  }

  async updateUserPassword(userId: string, newPassword: string, keepSessionToken?: string): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }

    const user = await this.getUserById(userId);
    if (!user) {
      return { success: false, error: 'User account not found.' };
    }

    const newHash = hashPassword(newPassword);

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.updateUserPassword(userId, newHash, keepSessionToken);
      return { success: true };
    }

    user.passwordHash = newHash;
    for (const [token, s] of Object.entries(this.data.sessions)) {
      const uid = typeof s === 'string' ? s : s.userId;
      if (uid === userId && token !== keepSessionToken) {
        delete this.data.sessions[token];
      }
    }
    this.save();
    return { success: true };
  }

  async deleteUserAccount(userId: string): Promise<{
    success: boolean;
    error?: string;
    deletedCount: { shipments: number; tickets: number; alerts: number; sessionsRevoked: number };
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: 'User account not found or already deleted.',
        deletedCount: { shipments: 0, tickets: 0, alerts: 0, sessionsRevoked: 0 },
      };
    }

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.deleteAccount(userId, user.email);
      return {
        success: true,
        deletedCount: { shipments: 1, tickets: 0, alerts: 0, sessionsRevoked: 1 },
      };
    }

    const normEmail = user.email.toLowerCase();
    if (!this.data.deletedUserIds) this.data.deletedUserIds = [];
    if (!this.data.deletedEmails) this.data.deletedEmails = [];
    this.data.deletedUserIds.push(userId);
    this.data.deletedEmails.push(normEmail);

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

    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.shipments = this.data.shipments.filter((s) => s.userId !== userId);
    this.data.tickets = this.data.tickets.filter((t) => t.userId !== userId);
    this.data.alerts = this.data.alerts.filter((a) => a.userId !== userId);
    delete this.data.emailIntegrations[userId];
    this.save();

    return {
      success: true,
      deletedCount: { shipments: shipCount, tickets: ticketCount, alerts: alertCount, sessionsRevoked },
    };
  }

  async updateUserProfile(userId: string, updates: Partial<User>): Promise<User | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const updated = await neonPostgres.updateUserProfile(userId, updates);
      return updated || undefined;
    }

    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return undefined;

    if (updates.name !== undefined) {
      user.name = updates.name.trim();
      user.avatarInitial = (user.name[0] || 'U').toUpperCase();
    }
    if (updates.backupRecipient !== undefined) user.backupRecipient = updates.backupRecipient;
    if (updates.deliveryInstructions !== undefined) user.deliveryInstructions = updates.deliveryInstructions;
    if (updates.notifications) {
      user.notifications = { ...user.notifications, ...updates.notifications };
    }
    this.save();
    return user;
  }

  // --- Shipments ---
  async getShipmentsForUser(userId: string, opts?: { filter?: string; search?: string }): Promise<Shipment[]> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.getShipmentsForUser(userId, opts?.filter, opts?.search);
    }

    let items = this.data.shipments.filter((s) => s.userId === userId);
    if (opts?.filter === 'active') {
      items = items.filter((s) => !s.isArchived && s.status !== 'Delivered');
    } else if (opts?.filter === 'delivered') {
      items = items.filter((s) => s.status === 'Delivered');
    } else if (opts?.filter === 'attention') {
      items = items.filter((s) => !s.isArchived && (s.status === 'Delivery attempted' || s.status === 'Delayed'));
    }

    if (opts?.search) {
      const q = opts.search.trim().toLowerCase();
      items = items.filter((s) =>
        s.item.toLowerCase().includes(q) ||
        s.trackingNumber.toLowerCase().includes(q) ||
        s.courierName.toLowerCase().includes(q) ||
        (s.store || '').toLowerCase().includes(q)
      );
    }
    return items;
  }

  async getShipmentById(id: string, userId: string): Promise<Shipment | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const s = await neonPostgres.getShipmentById(id, userId);
      return s || undefined;
    }
    return this.data.shipments.find((s) => s.id === id && s.userId === userId);
  }

  async findDuplicateShipment(userId: string, courier: string, trackingNumber: string): Promise<Shipment | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const s = await neonPostgres.findDuplicateShipment(userId, courier, trackingNumber);
      return s || undefined;
    }

    const cleanNum = trackingNumber.trim().toUpperCase();
    return this.data.shipments.find(
      (s) =>
        s.userId === userId &&
        !s.isArchived &&
        s.courier.toLowerCase() === courier.toLowerCase() &&
        s.trackingNumber.trim().toUpperCase() === cleanNum
    );
  }

  async addShipment(userId: string, shipment: Omit<Shipment, 'id' | 'userId' | 'createdAt'>): Promise<Shipment> {
    const id = 'ship_' + crypto.randomBytes(6).toString('hex');
    const newShipment: Shipment = {
      ...shipment,
      id,
      userId,
      isArchived: false,
      lastRefreshedAt: shipment.lastRefreshedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveShipment(newShipment);
      return newShipment;
    }

    this.data.shipments.unshift(newShipment);
    this.save();
    return newShipment;
  }

  async updateShipment(id: string, userId: string, updates: Partial<Shipment>): Promise<Shipment | undefined> {
    const shipment = await this.getShipmentById(id, userId);
    if (!shipment) return undefined;

    Object.assign(shipment, updates);

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveShipment(shipment);
      return shipment;
    }

    this.save();
    return shipment;
  }

  async refreshActiveShipments(): Promise<number> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      // Shipments update timestamp in Neon
      return 0;
    }
    const active = this.data.shipments.filter((s) => !s.isArchived && s.status !== 'Delivered');
    const now = new Date().toISOString();
    for (const s of active) {
      s.lastRefreshedAt = now;
    }
    if (active.length > 0) this.save();
    return active.length;
  }

  async removeShipment(id: string, userId: string): Promise<boolean> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.deleteShipment(id, userId);
      return true;
    }

    const beforeCount = this.data.shipments.length;
    this.data.shipments = this.data.shipments.filter((s) => !(s.id === id && s.userId === userId));
    const changed = this.data.shipments.length !== beforeCount;
    if (changed) this.save();
    return changed;
  }

  // --- In-App Alerts ---
  async getAlertsForUser(userId: string): Promise<InAppAlert[]> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.getAlertsForUser(userId);
    }
    return (this.data.alerts || []).filter((a) => a.userId === userId);
  }

  async addAlert(alert: Omit<InAppAlert, 'id' | 'createdAt'>): Promise<InAppAlert> {
    const newAlert: InAppAlert = {
      ...alert,
      id: 'alert_' + crypto.randomBytes(6).toString('hex'),
      read: false,
      createdAt: new Date().toISOString(),
    };

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveAlert(newAlert);
      return newAlert;
    }

    if (!this.data.alerts) this.data.alerts = [];
    this.data.alerts.unshift(newAlert);
    this.save();
    return newAlert;
  }

  async markAlertRead(id: string, userId: string): Promise<boolean> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.markAlertRead(id, userId);
    }
    const alert = (this.data.alerts || []).find((a) => a.id === id && a.userId === userId);
    if (alert) {
      alert.read = true;
      this.save();
      return true;
    }
    return false;
  }

  async markAllAlertsRead(userId: string): Promise<void> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.markAllAlertsRead(userId);
      return;
    }
    (this.data.alerts || []).forEach((a) => {
      if (a.userId === userId) a.read = true;
    });
    this.save();
  }

  async clearAlerts(userId: string): Promise<void> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.clearAlerts(userId);
      return;
    }
    this.data.alerts = (this.data.alerts || []).filter((a) => a.userId !== userId);
    this.save();
  }

  // --- Customer Care & Tickets ---
  async getTicketsForUser(userId: string): Promise<SupportTicket[]> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.getTicketsForUser(userId);
    }
    return (this.data.tickets || []).filter((t) => t.userId === userId);
  }

  async getAllTickets(): Promise<SupportTicket[]> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.getAllTickets();
    }
    return this.data.tickets || [];
  }

  async createTicket(params: {
    userId: string;
    userEmail: string;
    userName?: string;
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
  }): Promise<SupportTicket> {
    const id = 'ticket_' + crypto.randomBytes(6).toString('hex');
    const ticketRef = 'TCK-' + Math.floor(100000 + Math.random() * 900000);

    const newTicket: SupportTicket = {
      id,
      ticketRef,
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName || '',
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

    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveTicket(newTicket);
      return newTicket;
    }

    this.data.tickets.unshift(newTicket);
    this.save();
    return newTicket;
  }

  async updateTicketStatus(ticketId: string, status: SupportTicket['status'], staffReply?: string): Promise<SupportTicket | undefined> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      const updated = await neonPostgres.updateTicketStatus(ticketId, status, staffReply);
      return updated || undefined;
    }

    const ticket = this.data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return undefined;
    ticket.status = status;
    if (staffReply) ticket.staffReply = staffReply;
    this.save();
    return ticket;
  }

  // --- Email Integration ---
  async getEmailIntegration(userId: string): Promise<EmailIntegrationState> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      return await neonPostgres.getEmailIntegration(userId);
    }

    return (
      this.data.emailIntegrations[userId] || {
        status: 'disconnected',
        message: 'Gmail order scanning is not connected.',
      }
    );
  }

  async setEmailIntegration(userId: string, state: EmailIntegrationState): Promise<void> {
    if (this.isNeonActive()) {
      this.assertNeonReady();
      await neonPostgres.saveEmailIntegration(userId, state);
      return;
    }
    this.data.emailIntegrations[userId] = state;
    this.save();
  }
}

export const db = new Database();
