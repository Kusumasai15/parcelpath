import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCourier,
  isStoreOrderId,
  formatHonestEta,
  calculateSummaryStats,
  SUPPORTED_COURIERS
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
  assert.equal(stats.activeCount, 3); // 3 non-delivered
  assert.equal(stats.todayCount, 1);  // 1 arriving today
  assert.equal(stats.attentionCount, 1); // 1 attempted
});

test('SUPPORTED_COURIERS contains valid official tracking URLs', () => {
  const delhiveryUrl = SUPPORTED_COURIERS.delhivery.trackingUrl('123456');
  assert.equal(delhiveryUrl, 'https://www.delhivery.com/track/package/123456');

  const bluedartUrl = SUPPORTED_COURIERS.bluedart.trackingUrl('987654');
  assert.equal(bluedartUrl, 'https://www.bluedart.com/tracking?trackNumber=987654');
});
