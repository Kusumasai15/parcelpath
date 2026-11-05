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
  notificationPreferences?: {
    outForDelivery: boolean;
    deliveryAttempted: boolean;
    delivered: boolean;
  };
  alertHistory?: string[]; // tracked event signatures to guarantee 1 alert per distinct courier event
  liveCoordinates?: {
    hasRealGps?: boolean;
    latitude: number;
    longitude: number;
    updatedAt: string; // IST update timestamp from carrier
  };
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

export type SupportTicketCategory =
  | 'delivery_delayed'
  | 'missed_delivery'
  | 'delivered_not_received'
  | 'damaged_parcel'
  | 'wrong_item_received'
  | 'tracking_not_updating'
  | 'incorrect_delivery_info'
  | 'website_account_issue'
  | 'other'
  | 'delayed'
  | 'incorrect_status'
  | 'website_issue'
  | 'general_feedback';

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
  category: SupportTicketCategory | string;
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

export type PageViewId = 'dashboard' | 'deliveries' | 'preferences' | 'issues' | 'customer-care' | 'settings' | 'help';
