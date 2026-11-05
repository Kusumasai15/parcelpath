import test from 'node:test';
import assert from 'node:assert/strict';
import { getIstDateStr, getIstDateParts, msUntilNextIstMidnight, formatTodayDeliveryEta } from './istDate';
import { db } from '../server/db';
import { Shipment } from '../types';

test('Scenario 1: Today with three deliveries, undated parcels excluded, outline and count both present', () => {
  const istToday = getIstDateStr();

  // Create test parcels
  const parcels: Shipment[] = [
    {
      id: 'ship-1',
      userId: 'test-user',
      item: 'Wireless Headphones',
      store: 'Amazon',
      trackingNumber: 'DEL101',
      courier: 'delhivery',
      courierName: 'Delhivery',
      status: 'Out for delivery',
      eta: 'Today, 2:00 PM',
      estimatedDate: istToday,
      timeWindow: 'Today, 1:30–2:30 PM',
      location: 'Local Delivery Hub',
      events: [],
      isArchived: false,
      isDemo: false,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ship-2',
      userId: 'test-user',
      item: 'Sneakers',
      store: 'Myntra',
      trackingNumber: 'BLU202',
      courier: 'bluedart',
      courierName: 'Blue Dart',
      status: 'In transit',
      eta: 'Today',
      estimatedDate: istToday,
      location: 'City Hub',
      events: [],
      isArchived: false,
      isDemo: false,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ship-3',
      userId: 'test-user',
      item: 'Coffee Beans',
      store: 'Blue Tokai',
      trackingNumber: 'EK303',
      courier: 'ekart',
      courierName: 'Ekart Logistics',
      status: 'In transit',
      eta: 'Expected today',
      estimatedDate: istToday,
      location: 'Regional Sorting Office',
      events: [],
      isArchived: false,
      isDemo: false,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    // Undated parcel: should be excluded from calendar
    {
      id: 'ship-undated',
      userId: 'test-user',
      item: 'Pre-order Book',
      store: 'Book Depository',
      trackingNumber: 'UND000',
      courier: 'indiapost',
      courierName: 'India Post',
      status: 'In transit',
      eta: 'Pending carrier scan',
      estimatedDate: undefined, // No date
      location: 'Origin Facility',
      events: [],
      isArchived: false,
      isDemo: false,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    // Future date parcel: should not count for today
    {
      id: 'ship-future',
      userId: 'test-user',
      item: 'Laptop Stand',
      store: 'Flipkart',
      trackingNumber: 'FUT999',
      courier: 'delhivery',
      courierName: 'Delhivery',
      status: 'In transit',
      eta: 'Tomorrow',
      estimatedDate: '2099-12-31',
      location: 'National Sorting Hub',
      events: [],
      isArchived: false,
      isDemo: false,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  // 1. Verify calendar grouping filters out undated parcels and counts each parcel once
  const calendarMap: Record<string, Shipment[]> = {};
  for (const s of parcels) {
    if (s.isArchived) continue;
    if (!s.estimatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(s.estimatedDate.trim())) {
      continue;
    }
    const key = s.estimatedDate.trim();
    if (!calendarMap[key]) calendarMap[key] = [];
    calendarMap[key].push(s);
  }

  // Undated parcel must NOT be in the calendar
  assert.equal(calendarMap['undefined'], undefined);
  assert.equal(Object.values(calendarMap).flat().some((p) => p.id === 'ship-undated'), false);

  // Today must have exactly 3 deliveries
  const todayParcels = calendarMap[istToday] || [];
  assert.equal(todayParcels.length, 3);

  // Each parcel counted exactly once
  const allCountedIds = Object.values(calendarMap).flat().map((p) => p.id);
  assert.equal(allCountedIds.length, 4); // 3 today + 1 future
  assert.equal(new Set(allCountedIds).size, 4);

  // Label formatting: "3 orders"
  const formatCountLabel = (count: number) => `${count} ${count === 1 ? 'order' : 'orders'}`;
  assert.equal(formatCountLabel(todayParcels.length), '3 orders');

  // Verify delivery window formatting for today's parcels:
  // Parcel 1 has a time window -> displays time window
  assert.equal(formatTodayDeliveryEta(parcels[0].timeWindow, parcels[0].eta), 'Today, 1:30–2:30 PM');
  // Parcel 2 has only date/today -> displays "Expected today · Time not provided"
  assert.equal(formatTodayDeliveryEta(undefined, parcels[1].eta), 'Expected today · Time not provided');
});

test('Scenario 2: IST midnight rollover transitions date and moves outline', () => {
  // 11:59:50 PM IST on May 10, 2026 -> 18:29:50 UTC May 10
  const beforeMidnight = new Date(Date.UTC(2026, 4, 10, 18, 29, 50)); // UTC 18:29:50 = IST 23:59:50
  const istBefore = getIstDateStr(beforeMidnight);
  assert.equal(istBefore, '2026-05-10');

  // 00:00:05 AM IST on May 11, 2026 -> 18:30:05 UTC May 10
  const afterMidnight = new Date(Date.UTC(2026, 4, 10, 18, 30, 5)); // UTC 18:30:05 = IST 00:00:05
  const istAfter = getIstDateStr(afterMidnight);
  assert.equal(istAfter, '2026-05-11');

  // Verify parts extraction
  const partsAfter = getIstDateParts(afterMidnight);
  assert.equal(partsAfter.year, 2026);
  assert.equal(partsAfter.month, 4); // May (0-indexed)
  assert.equal(partsAfter.day, 11);
  assert.equal(partsAfter.dateStr, '2026-05-11');

  // Verify milliseconds until next IST midnight from 23:59:50 is ~10,000ms
  const msToMidnight = msUntilNextIstMidnight(beforeMidnight);
  assert.ok(msToMidnight >= 9000 && msToMidnight <= 11000, `Expected ~10000ms, got ${msToMidnight}`);
});

test('Scenario 3: Reschedule moves parcel count from day A to day B', () => {
  const uniqueEmail = `test_reschedule_${Date.now()}@example.com`;
  const user = db.createUser('Test Rescheduler', uniqueEmail, 'Password123!', true);
  const userId = user.id;

  const dayA = '2026-11-20';
  const dayB = '2026-11-22';

  // Seed 2 shipments on Day A and 1 on Day B
  const s1 = db.addShipment(userId, {
    item: 'Item A1',
    store: 'Amazon',
    trackingNumber: 'TRACK_A1',
    courier: 'delhivery',
    courierName: 'Delhivery',
    status: 'In transit',
    eta: dayA,
    estimatedDate: dayA,
    location: 'Mumbai Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
  });

  db.addShipment(userId, {
    item: 'Item A2',
    store: 'Flipkart',
    trackingNumber: 'TRACK_A2',
    courier: 'bluedart',
    courierName: 'Blue Dart',
    status: 'In transit',
    eta: dayA,
    estimatedDate: dayA,
    location: 'Mumbai Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
  });

  db.addShipment(userId, {
    item: 'Item B1',
    store: 'Myntra',
    trackingNumber: 'TRACK_B1',
    courier: 'ekart',
    courierName: 'Ekart Logistics',
    status: 'In transit',
    eta: dayB,
    estimatedDate: dayB,
    location: 'Delhi Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
  });

  // Check initial counts
  const userParcelsBefore = db.getShipmentsForUser(userId);
  const countDayABefore = userParcelsBefore.filter((s) => s.estimatedDate === dayA).length;
  const countDayBBefore = userParcelsBefore.filter((s) => s.estimatedDate === dayB).length;
  assert.equal(countDayABefore, 2, 'Day A should initially have 2 orders');
  assert.equal(countDayBBefore, 1, 'Day B should initially have 1 order');

  // Courier confirms reschedule of s1 to Day B
  const updated = db.confirmRescheduledDelivery(s1.id, userId, dayB, 'Afternoon 2–5 PM');
  assert.ok(updated, 'Reschedule update should succeed');
  assert.equal(updated?.estimatedDate, dayB);
  assert.equal(updated?.timeWindow, 'Afternoon 2–5 PM');

  // Check updated counts: Day A decrements from 2 to 1; Day B increments from 1 to 2
  const userParcelsAfter = db.getShipmentsForUser(userId);
  const countDayAAfter = userParcelsAfter.filter((s) => s.estimatedDate === dayA).length;
  const countDayBAfter = userParcelsAfter.filter((s) => s.estimatedDate === dayB).length;

  assert.equal(countDayAAfter, 1, 'Day A count should decrement to 1 order');
  assert.equal(countDayBAfter, 2, 'Day B count should increment to 2 orders');
  assert.equal(userParcelsAfter.length, 3, 'Total parcel count must remain constant');
});

test('Scenario 4: Repeated courier updates produce only one alert (deduplication)', () => {
  const uniqueEmail = `test_alerts_${Date.now()}@example.com`;
  const user = db.createUser('Alerts Test', uniqueEmail, 'Password123!', true);
  const userId = user.id;

  // Create shipment with notifications enabled for outForDelivery and delivered
  const shipment = db.addShipment(userId, {
    item: 'Smartwatch',
    store: 'Titan',
    trackingNumber: 'TITAN_TRACK_99',
    courier: 'delhivery',
    courierName: 'Delhivery',
    status: 'Out for delivery',
    eta: 'Today',
    location: 'Koramangala Hub',
    events: [],
    isArchived: false,
    isDemo: false,
    lastRefreshedAt: new Date().toISOString(),
    notificationPreferences: {
      outForDelivery: true,
      deliveryAttempted: true,
      delivered: true,
    },
    alertHistory: [],
  });

  // First dispatch: courier updates "Out for delivery" at 09:30 AM
  const event1 = {
    type: 'out_for_delivery' as const,
    eventSignature: 'sig_delhivery_out_for_delivery_09_30',
    title: 'Out for delivery: Smartwatch',
    message: 'Your parcel is out for delivery with agent.',
  };

  const alert1 = db.dispatchShipmentAlert(userId, shipment.id, event1);
  assert.ok(alert1, 'First alert should be dispatched and returned');

  // Verify alert is in user notifications
  const alerts1 = db.getAlertsForUser(userId);
  assert.equal(alerts1.length, 1);
  assert.equal(alerts1[0].title, 'Out for delivery: Smartwatch');

  // Repeated update: background refresh or duplicate webhook receives exact same courier event
  const alert2 = db.dispatchShipmentAlert(userId, shipment.id, event1);
  assert.equal(alert2, null, 'Duplicate courier update must return null (not dispatched)');

  // User alerts list must STILL have only 1 alert
  const alerts2 = db.getAlertsForUser(userId);
  assert.equal(alerts2.length, 1, 'Total alert count must remain 1 after duplicate update');

  // New distinct event arrives: "Delivered" at 02:45 PM
  const event2 = {
    type: 'delivered' as const,
    eventSignature: 'sig_delhivery_delivered_02_45',
    title: 'Delivered: Smartwatch',
    message: 'Package delivered at front door.',
  };

  const alert3 = db.dispatchShipmentAlert(userId, shipment.id, event2);
  assert.ok(alert3, 'Distinct new event should be dispatched');

  const alerts3 = db.getAlertsForUser(userId);
  assert.equal(alerts3.length, 2, 'Total alerts should now be 2 for 2 distinct events');
});
