export interface CourierInfo {
  id: string;
  name: string;
  shortCode: string;
  trackingUrl: (trackingNumber: string) => string;
  reschedulingUrl?: (trackingNumber: string) => string;
}

export const SUPPORTED_COURIERS: Record<string, CourierInfo> = {
  delhivery: {
    id: 'delhivery',
    name: 'Delhivery',
    shortCode: 'DEL',
    trackingUrl: (awb) => `https://www.delhivery.com/track/package/${awb}`,
    reschedulingUrl: (awb) => `https://www.delhivery.com/support?awb=${awb}`,
  },
  bluedart: {
    id: 'bluedart',
    name: 'Blue Dart',
    shortCode: 'BD',
    trackingUrl: (awb) => `https://www.bluedart.com/tracking?trackNumber=${awb}`,
    reschedulingUrl: (awb) => `https://www.bluedart.com/contact-us`,
  },
  dtdc: {
    id: 'dtdc',
    name: 'DTDC',
    shortCode: 'DTDC',
    trackingUrl: (awb) => `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${awb}`,
    reschedulingUrl: (awb) => `https://www.dtdc.in/query.asp`,
  },
  ekart: {
    id: 'ekart',
    name: 'Ekart Logistics',
    shortCode: 'EKART',
    trackingUrl: (awb) => `https://ekartlogistics.com/shipmenttrack/${awb}`,
  },
  shadowfax: {
    id: 'shadowfax',
    name: 'Shadowfax',
    shortCode: 'SF',
    trackingUrl: (awb) => `https://tracker.shadowfax.in/#/track/${awb}`,
  },
  xpressbees: {
    id: 'xpressbees',
    name: 'Xpressbees',
    shortCode: 'XB',
    trackingUrl: (awb) => `https://www.xpressbees.com/track?awb=${awb}`,
  },
  indiapost: {
    id: 'indiapost',
    name: 'India Post (Speed Post)',
    shortCode: 'IP',
    trackingUrl: (awb) => `https://www.indiapost.gov.in/_layouts/15/dpt.cept.tracking/trackconsignment.aspx?Consignment=${awb}`,
  },
  amazon_shipping: {
    id: 'amazon_shipping',
    name: 'Amazon Shipping',
    shortCode: 'AMZ',
    trackingUrl: (awb) => `https://track.amazon.in/tracking/${awb}`,
    reschedulingUrl: (awb) => `https://www.amazon.in/your-orders`,
  },
  other: {
    id: 'other',
    name: 'Other Courier',
    shortCode: 'PKG',
    trackingUrl: (awb) => `https://www.google.com/search?q=${encodeURIComponent(awb + ' tracking')}`,
  },
};

/**
 * Checks if the string matches common shopping retailer order IDs
 * rather than courier tracking numbers / AWBs.
 */
export function isStoreOrderId(input: string): { isStoreId: boolean; storeName?: string; tip?: string } {
  const trimmed = input.trim();
  // Amazon Order ID: 402-1234567-8901234 or 123-4567890-1234567
  if (/^\d{3}-\d{7}-\d{7}$/.test(trimmed)) {
    return {
      isStoreId: true,
      storeName: 'Amazon',
      tip: 'This is an Amazon retail Order ID. Courier tracking requires the carrier tracking number (AWB) from your dispatch email or order details.',
    };
  }
  // Flipkart Order ID: OD123456789012345678
  if (/^OD\d{15,20}$/i.test(trimmed)) {
    return {
      isStoreId: true,
      storeName: 'Flipkart',
      tip: 'This is a Flipkart Order ID (OD...). Flipkart parcels are usually shipped via Ekart, Delhivery, or Blue Dart with their own tracking AWB.',
    };
  }
  // Nykaa Order ID: NYK-1234567-123456
  if (/^NYK[-_]?\d+/i.test(trimmed)) {
    return {
      isStoreId: true,
      storeName: 'Nykaa',
      tip: 'This is a Nykaa order reference. Please enter the courier AWB assigned once the order is packed and dispatched.',
    };
  }
  // Tira Order ID: TIRA-12345 or TIRA\d+
  if (/^TIRA[-_]?\d+/i.test(trimmed)) {
    return {
      isStoreId: true,
      storeName: 'Tira',
      tip: 'This is a Tira order reference. Use the carrier tracking number found on your invoice or dispatch SMS.',
    };
  }

  return { isStoreId: false };
}

/**
 * Detects courier from tracking number pattern.
 */
export function detectCourier(trackingNumber: string): string {
  const clean = trackingNumber.trim().toUpperCase();

  // India Post: 2 letters + 9 digits + IN (e.g. EM123456789IN)
  if (/^[A-Z]{2}\d{9}IN$/.test(clean)) {
    return 'indiapost';
  }

  // Ekart: Starts with FMPC or similar + 10+ digits
  if (/^FMPC\d{8,}$/i.test(clean) || /^EKART\d+/i.test(clean)) {
    return 'ekart';
  }

  // Amazon Shipping: Starts with TBA or 100/101 + digits
  if (/^TBA\d{10,}$/i.test(clean)) {
    return 'amazon_shipping';
  }

  // DTDC: D or B or P + 8 digits (e.g. D12345678) or starts with DTDC
  if (/^[A-Z]\d{8}$/.test(clean) || /^DTDC/i.test(clean)) {
    return 'dtdc';
  }

  // Shadowfax: SF / SH + 8-12 digits
  if (/^(SF|SH)\d{8,14}$/i.test(clean)) {
    return 'shadowfax';
  }

  // Xpressbees: 14-16 digits starting with 1 or 2, or XB/XPB prefix
  if (/^(XB|XPB)\d{8,16}$/i.test(clean) || (clean.length === 15 && /^\d+$/.test(clean))) {
    return 'xpressbees';
  }

  // Delhivery: 12 to 14 pure digits
  if (/^\d{12,14}$/.test(clean)) {
    return 'delhivery';
  }

  // Blue Dart: 8 to 11 pure digits
  if (/^\d{8,11}$/.test(clean)) {
    return 'bluedart';
  }

  return 'other';
}

/**
 * Formats an honest ETA without fabricating arrival times
 */
export function formatHonestEta(params: {
  status: string;
  estimatedDate?: string;
  timeWindow?: string;
}): { main: string; sub: string } {
  const { status, estimatedDate, timeWindow } = params;

  if (status === 'Delivered') {
    return { main: 'Delivered', sub: 'Package handed over' };
  }

  if (status === 'Delivery attempted') {
    return { main: 'Check available options', sub: 'A handoff may be needed' };
  }

  if (status === 'Delayed' || status === 'Exception') {
    return { main: 'Shipment delayed', sub: 'Courier investigating transit delay' };
  }

  if (timeWindow) {
    return { main: timeWindow, sub: 'Estimated arrival' };
  }

  if (estimatedDate) {
    return { main: `Expected ${estimatedDate}`, sub: 'Time not available yet' };
  }

  return { main: 'Updating', sub: 'Awaiting courier estimate' };
}

export interface SummaryStats {
  activeCount: number;
  todayCount: number;
  attentionCount: number;
}

export function calculateSummaryStats(shipments: Array<{ status: string; eta?: string; timeWindow?: string }>): SummaryStats {
  let activeCount = 0;
  let todayCount = 0;
  let attentionCount = 0;

  for (const s of shipments) {
    const isDelivered = s.status === 'Delivered';
    const isAttention = s.status === 'Delivery attempted' || s.status === 'Delayed' || s.status === 'Exception';

    if (!isDelivered) {
      activeCount++;
    }

    if (isAttention) {
      attentionCount++;
    }

    const etaText = (s.eta || '').toLowerCase() + ' ' + (s.timeWindow || '').toLowerCase();
    if (!isDelivered && (etaText.includes('today') || s.status === 'Out for delivery')) {
      todayCount++;
    }
  }

  return { activeCount, todayCount, attentionCount };
}

/**
 * Formats elapsed time since last successful tracking refresh.
 * Guaranteed to compute based on real ISO timestamp so page reloads don't reset to "just now".
 */
export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Updated recently';
  const timestamp = new Date(isoString).getTime();
  if (isNaN(timestamp)) return 'Updated recently';

  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `Updated ${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
}

export interface ShipmentProgress {
  stage: 'confirmed' | 'in_transit' | 'out_for_delivery' | 'delivered';
  percentage: number;
  isAlert: boolean;
  label: string;
}

/**
 * Calculates a progress step based on actual parcel status.
 * Never falsely marks progress as completed if delayed or attempted.
 */
export function getShipmentProgress(status: string): ShipmentProgress {
  const norm = status.toLowerCase();

  if (norm.includes('delivered')) {
    return { stage: 'delivered', percentage: 100, isAlert: false, label: 'Delivered' };
  }

  if (norm.includes('out for delivery')) {
    return { stage: 'out_for_delivery', percentage: 75, isAlert: false, label: 'Out for delivery' };
  }

  if (norm.includes('attempted')) {
    return { stage: 'out_for_delivery', percentage: 75, isAlert: true, label: 'Delivery attempted' };
  }

  if (norm.includes('delayed') || norm.includes('exception')) {
    return { stage: 'in_transit', percentage: 45, isAlert: true, label: 'Transit delayed' };
  }

  if (norm.includes('transit') || norm.includes('shipped')) {
    return { stage: 'in_transit', percentage: 45, isAlert: false, label: 'In transit' };
  }

  return { stage: 'confirmed', percentage: 15, isAlert: false, label: 'Order confirmed' };
}

/**
 * Groups delivered shipments by human-readable month string (e.g., "November 2026")
 */
export function groupDeliveredByMonth<T extends { status: string; createdAt: string }>(
  shipments: T[]
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};

  const deliveredOnly = shipments.filter((s) => s.status === 'Delivered');

  for (const s of deliveredOnly) {
    const d = new Date(s.createdAt);
    const monthKey = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'Previous Deliveries';

    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(s);
  }

  return groups;
}

/**
 * Groups active shipments by estimated arrival date (YYYY-MM-DD).
 */
export function groupShipmentsByDate<T extends { estimatedDate?: string; eta?: string; status: string }>(
  shipments: T[]
): {
  byDate: Record<string, T[]>;
  awaitingDate: T[];
} {
  const byDate: Record<string, T[]> = {};
  const awaitingDate: T[] = [];

  for (const s of shipments) {
    if (s.status === 'Delivered') continue;

    if (s.estimatedDate && /^\d{4}-\d{2}-\d{2}$/.test(s.estimatedDate)) {
      if (!byDate[s.estimatedDate]) {
        byDate[s.estimatedDate] = [];
      }
      byDate[s.estimatedDate].push(s);
    } else {
      awaitingDate.push(s);
    }
  }

  return { byDate, awaitingDate };
}
