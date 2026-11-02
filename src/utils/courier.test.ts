import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCourier,
  isStoreOrderId,
  formatHonestEta,
  calculateSummaryStats,
  SUPPORTED_COURIERS,
  formatRelativeTime,
  getShipmentProgress,
  groupShipmentsByDate,
  groupDeliveredByMonth
} from './courier';

test('detectCourier correctly identifies Indian couriers', () => {
  assert.equal(detectCourier('EM123456789IN'), 'indiapost');
  assert.equal(detectCourier('FMPC1234567890'), 'ekart');
  assert.equal(detectCourier('D12345678'), 'dtdc');
  assert.equal(detectCourier('123456789012'), 'delhivery'); // 12 digits
  assert.equal(detectCourier('123456789'), 'bluedart'); // 9 digits
  assert.equal(detectCourier('SF1234567890'), 'shadowfax');
  assert.equal(detectCourier('XB123456789'), 'xpressbees');
  assert.equal(detectCourier('TBA123456789012'), 'amazon_shipping');
  assert.equal(detectCourier('XYZUNKNOWN99'), 'other');
});

test('isStoreOrderId flags retailer order numbers with tips', () => {
  const amazonCheck = isStoreOrderId('402-1234567-8901234');
  assert.equal(amazonCheck.isStoreId, true);
  assert.equal(amazonCheck.storeName, 'Amazon');
  assert.match(amazonCheck.tip!, /Amazon retail Order ID/);

  const flipkartCheck = isStoreOrderId('OD123456789012345678');
  assert.equal(flipkartCheck.isStoreId, true);
  assert.equal(flipkartCheck.storeName, 'Flipkart');

  const regularAwb = isStoreOrderId('123456789012');
  assert.equal(regularAwb.isStoreId, false);
});

test('formatHonestEta does not fabricate arrival minutes when date-only', () => {
  const dateOnly = formatHonestEta({ status: 'In transit', estimatedDate: 'tomorrow' });
  assert.equal(dateOnly.main, 'Expected tomorrow');
  assert.equal(dateOnly.sub, 'Time not available yet');

  const timeWindow = formatHonestEta({ status: 'Out for delivery', timeWindow: 'Today, 2:30–3:15 PM' });
  assert.equal(timeWindow.main, 'Today, 2:30–3:15 PM');
  assert.equal(timeWindow.sub, 'Estimated arrival');

  const attempted = formatHonestEta({ status: 'Delivery attempted' });
  assert.equal(attempted.main, 'Check available options');
  assert.equal(attempted.sub, 'A handoff may be needed');
});

test('calculateSummaryStats computes counts from actual saved data', () => {
  const sample = [
    { status: 'Out for delivery', eta: 'Today, 2:30–3:15 PM' },
    { status: 'Delivery attempted', eta: 'Check available options' },
    { status: 'In transit', eta: 'Expected tomorrow' },
    { status: 'Delivered', eta: 'Delivered yesterday' }
  ];

  const stats = calculateSummaryStats(sample);
  assert.equal(stats.activeCount, 3);
  assert.equal(stats.todayCount, 1);
  assert.equal(stats.attentionCount, 1);
});

test('formatRelativeTime calculates real elapsed time accurately', () => {
  const now = new Date();
  assert.equal(formatRelativeTime(now.toISOString()), 'Updated just now');

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(formatRelativeTime(fiveMinAgo), 'Updated 5 minutes ago');

  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  assert.equal(formatRelativeTime(twoHoursAgo), 'Updated 2 hours ago');
});

test('getShipmentProgress handles normal, delayed, and attempted stages honestly', () => {
  const confirmed = getShipmentProgress('Confirmed');
  assert.equal(confirmed.stage, 'confirmed');
  assert.equal(confirmed.isAlert, false);

  const transit = getShipmentProgress('In transit');
  assert.equal(transit.stage, 'in_transit');
  assert.equal(transit.percentage, 45);

  const delayed = getShipmentProgress('Delayed');
  assert.equal(delayed.stage, 'in_transit');
  assert.equal(delayed.isAlert, true);

  const attempted = getShipmentProgress('Delivery attempted');
  assert.equal(attempted.stage, 'out_for_delivery');
  assert.equal(attempted.isAlert, true);

  const delivered = getShipmentProgress('Delivered');
  assert.equal(delivered.stage, 'delivered');
  assert.equal(delivered.percentage, 100);
  assert.equal(delivered.isAlert, false);
});

test('groupShipmentsByDate groups by date and captures awaiting-date items', () => {
  const list = [
    { estimatedDate: '2026-11-02', status: 'In transit' },
    { estimatedDate: '2026-11-02', status: 'Out for delivery' },
    { estimatedDate: '2026-11-05', status: 'In transit' },
    { status: 'In transit' }, // no estimated date
    { estimatedDate: '2026-11-01', status: 'Delivered' } // delivered should be ignored
  ];

  const grouped = groupShipmentsByDate(list);
  assert.equal(grouped.byDate['2026-11-02'].length, 2);
  assert.equal(grouped.byDate['2026-11-05'].length, 1);
  assert.equal(grouped.awaitingDate.length, 1);
  assert.equal(grouped.byDate['2026-11-01'], undefined);
});

test('groupDeliveredByMonth groups completed parcels by month string', () => {
  const list = [
    { status: 'Delivered', createdAt: '2026-11-01T10:00:00Z' },
    { status: 'Delivered', createdAt: '2026-10-15T10:00:00Z' },
    { status: 'In transit', createdAt: '2026-11-02T10:00:00Z' }
  ];

  const grouped = groupDeliveredByMonth(list);
  assert.equal(Object.keys(grouped).length, 2);
  assert.equal(grouped['November 2026']?.length, 1);
  assert.equal(grouped['October 2026']?.length, 1);
});
