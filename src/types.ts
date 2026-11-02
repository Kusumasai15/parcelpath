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
  estimatedDate?: string; // YYYY-MM-DD
  timeWindow?: string;    // e.g. "Today, 2:30–3:15 PM" or undefined
  location: string;
  events: TrackingEvent[];
  imageUrl?: string;
  isArchived: boolean;
  isDemo: boolean;
  notes?: string;
  lastUpdated?: string;      // Human label e.g. "Updated 5 minutes ago"
  lastRefreshedAt: string;   // ISO timestamp of last successful tracking refresh
  courierEventTime?: string; // Carrier's own event timestamp e.g. "Today, 10:42 AM"
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarInitial: string;
  backupRecipient: string;
  deliveryInstructions: string;
  notifications: {
    statusUpdates: boolean;
    arrivalReminders: boolean;
  };
  role: 'user' | 'staff' | 'admin';
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

export type PageViewId = 'dashboard' | 'deliveries' | 'preferences' | 'issues' | 'customer-care' | 'settings' | 'help';
