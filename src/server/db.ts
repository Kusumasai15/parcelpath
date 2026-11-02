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
  store: string;
  trackingNumber: string;
  courier: string;
  courierName: string;
  status: 'In transit' | 'Out for delivery' | 'Delivery attempted' | 'Delivered' | 'Delayed' | 'Exception';
  eta: string;
  timeWindow?: string;
  location: string;
  events: TrackingEvent[];
  imageUrl?: string;
  isArchived: boolean;
  isDemo: boolean;
  notes?: string;
  lastUpdated: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketRef: string;
  userId: string;
  userEmail: string;
  userName: string;
  shipmentId?: string;
  shipmentLabel?: string;
  category: 'delayed' | 'incorrect_status' | 'missed_delivery' | 'delivered_not_received' | 'website_issue' | 'general_feedback';
  subject: string;
  description: string;
  status: 'Open' | 'In review' | 'Resolved';
  staffReply?: string;
  createdAt: string;
}

export interface EmailIntegrationState {
  status: 'disconnected' | 'setup_required' | 'connected';
  email?: string;
  connectedAt?: string;
  message?: string;
}

export interface DatabaseSchema {
  users: User[];
  shipments: Shipment[];
  tickets: SupportTicket[];
  sessions: Record<string, string>; // token -> userId
  emailIntegrations: Record<string, EmailIntegrationState>; // userId -> state
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_parcelpath_salt').digest('hex');
}

function initDefaultDatabase(): DatabaseSchema {
  const defaultUserId = 'user_kusuma_default';
  const defaultPasswordHash = hashPassword('welcome123');

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
    createdAt: new Date().toISOString(),
  };

  const defaultShipments: Shipment[] = [
    {
      id: 'ship_4821',
      userId: defaultUserId,
      item: 'Wireless headphones',
      store: 'Amazon',
      trackingNumber: '…4821',
      courier: 'delhivery',
      courierName: 'Delhivery',
      status: 'Out for delivery',
      eta: 'Today, 2:30–3:15 PM',
      timeWindow: 'Today, 2:30–3:15 PM',
      location: 'Local delivery hub (Today, 8:05 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 3:15 PM', isDone: true },
        { title: 'Reached local delivery hub', time: 'Today, 8:05 AM', isDone: true },
        { title: 'Out for delivery', time: 'Today, 10:42 AM', isDone: true },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: 'A few minutes ago',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'ship_9034',
      userId: defaultUserId,
      item: 'Daily skincare set',
      store: 'Nykaa',
      trackingNumber: '…9034',
      courier: 'bluedart',
      courierName: 'Blue Dart',
      status: 'Delivery attempted',
      eta: 'Check available options',
      location: 'Delivery center (Today, 11:15 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 4:30 PM', isDone: true },
        { title: 'Delivery attempted', time: 'Today, 11:15 AM', isDone: true },
        { title: 'Waiting for next update', time: 'Time not available', isDone: false },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: '1 hour ago',
      createdAt: new Date(Date.now() - 90000000).toISOString(),
    },
    {
      id: 'ship_1172',
      userId: defaultUserId,
      item: 'Cotton kurta',
      store: 'Flipkart',
      trackingNumber: '…1172',
      courier: 'ekart',
      courierName: 'Ekart Logistics',
      status: 'In transit',
      eta: 'Expected tomorrow',
      location: 'Transit hub (Today, 7:45 AM)',
      events: [
        { title: 'Order confirmed', time: 'Yesterday, 7:20 PM', isDone: true },
        { title: 'Parcel in transit', time: 'Today, 7:45 AM', isDone: true },
        { title: 'Next scan', time: 'Awaiting courier update', isDone: false },
      ],
      isArchived: false,
      isDemo: true,
      lastUpdated: '3 hours ago',
      createdAt: new Date(Date.now() - 95000000).toISOString(),
    },
  ];

  const defaultToken = 'demo_session_token_kusuma';

  return {
    users: [defaultUser],
    shipments: defaultShipments,
    tickets: [],
    sessions: {
      [defaultToken]: defaultUserId,
    },
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
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Could not read existing database, initializing fresh:', e);
    }

    const initial = initDefaultDatabase();
    this.save(initial);
    return initial;
  }

  private save(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave || this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving database to file:', e);
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
    const userId = this.data.sessions[token];
    if (!userId) return undefined;
    return this.getUserById(userId);
  }

  createSession(userId: string): string {
    const token = 'sess_' + crypto.randomBytes(24).toString('hex');
    this.data.sessions[token] = userId;
    this.save();
    return token;
  }

  removeSession(token: string): void {
    delete this.data.sessions[token];
    this.save();
  }

  createUser(name: string, email: string, password: string): User {
    const id = 'user_' + crypto.randomBytes(8).toString('hex');
    const newUser: User = {
      id,
      email: email.trim().toLowerCase(),
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
      createdAt: new Date().toISOString(),
    };

    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  verifyPassword(user: User, password: string): boolean {
    return user.passwordHash === hashPassword(password);
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

  deleteUser(userId: string): boolean {
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.data.shipments = this.data.shipments.filter((s) => s.userId !== userId);
    this.data.tickets = this.data.tickets.filter((t) => t.userId !== userId);
    delete this.data.emailIntegrations[userId];
    for (const [t, uid] of Object.entries(this.data.sessions)) {
      if (uid === userId) delete this.data.sessions[t];
    }
    this.save();
    return true;
  }

  // --- Shipments ---
  getShipmentsForUser(userId: string, options: { search?: string; filter?: string } = {}): Shipment[] {
    let list = this.data.shipments.filter((s) => s.userId === userId && !s.isArchived);

    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter(
        (s) =>
          s.item.toLowerCase().includes(q) ||
          s.store.toLowerCase().includes(q) ||
          s.trackingNumber.toLowerCase().includes(q) ||
          s.courierName.toLowerCase().includes(q)
      );
    }

    if (options.filter === 'active') {
      list = list.filter((s) => s.status !== 'Delivered');
    } else if (options.filter === 'delivered') {
      list = list.filter((s) => s.status === 'Delivered');
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

  addShipment(userId: string, shipment: Omit<Shipment, 'id' | 'userId' | 'createdAt' | 'lastUpdated'>): Shipment {
    const id = 'ship_' + crypto.randomBytes(6).toString('hex');
    const newShipment: Shipment = {
      ...shipment,
      id,
      userId,
      isArchived: false,
      lastUpdated: 'Just now',
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
    shipment.lastUpdated = 'Just now';
    this.save();
    return shipment;
  }

  removeShipment(id: string, userId: string): boolean {
    const beforeCount = this.data.shipments.length;
    this.data.shipments = this.data.shipments.filter((s) => !(s.id === id && s.userId === userId));
    const changed = this.data.shipments.length !== beforeCount;
    if (changed) this.save();
    return changed;
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
    shipmentId?: string;
    shipmentLabel?: string;
    category: SupportTicket['category'];
    subject: string;
    description: string;
  }): SupportTicket {
    const id = 'tkt_' + crypto.randomBytes(6).toString('hex');
    const refNum = 'TKT-' + Math.floor(1000 + Math.random() * 9000) + '-' + new Date().getFullYear();

    const newTicket: SupportTicket = {
      id,
      ticketRef: refNum,
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      shipmentId: params.shipmentId,
      shipmentLabel: params.shipmentLabel,
      category: params.category,
      subject: params.subject,
      description: params.description,
      status: 'Open',
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
