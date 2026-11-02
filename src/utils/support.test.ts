import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateContactDetails,
  validateAttachment,
  isShipmentRequiredForCategory,
  getCategoryLabel,
  SUPPORT_CATEGORIES,
  MAX_ATTACHMENT_BYTES,
} from './support';

test('isShipmentRequiredForCategory correctly identifies shipment vs website issues', () => {
  assert.equal(isShipmentRequiredForCategory('delivery_delayed'), true);
  assert.equal(isShipmentRequiredForCategory('damaged_parcel'), true);
  assert.equal(isShipmentRequiredForCategory('missed_delivery'), true);
  assert.equal(isShipmentRequiredForCategory('website_account_issue'), false);
  assert.equal(isShipmentRequiredForCategory('other'), false);
});

test('getCategoryLabel maps all required user categories to display text', () => {
  assert.equal(getCategoryLabel('delivery_delayed'), 'Delivery delayed');
  assert.equal(getCategoryLabel('missed_delivery'), 'Delivery attempted / missed delivery');
  assert.equal(getCategoryLabel('delivered_not_received'), 'Delivered but not received');
  assert.equal(getCategoryLabel('damaged_parcel'), 'Damaged parcel');
  assert.equal(getCategoryLabel('wrong_item_received'), 'Wrong item received');
  assert.equal(getCategoryLabel('tracking_not_updating'), 'Tracking not updating');
  assert.equal(getCategoryLabel('incorrect_delivery_info'), 'Incorrect delivery information');
  assert.equal(getCategoryLabel('website_account_issue'), 'Website or account problem');
  assert.equal(getCategoryLabel('other'), 'Other');
});

test('validateContactDetails requires valid contact value for preferred method', () => {
  // Missing name
  const resNoName = validateContactDetails({
    name: '',
    email: 'test@example.com',
    phone: '',
    whatsapp: '',
    preferredMethod: 'email',
  });
  assert.equal(resNoName.isValid, false);
  assert.match(resNoName.errors.name, /name/);

  // Preferred Email: missing or invalid email
  const resBadEmail = validateContactDetails({
    name: 'Kusuma',
    email: 'not-an-email',
    phone: '',
    whatsapp: '',
    preferredMethod: 'email',
  });
  assert.equal(resBadEmail.isValid, false);
  assert.match(resBadEmail.errors.email, /valid email/);

  // Preferred Phone: valid phone passes
  const resGoodPhone = validateContactDetails({
    name: 'Kusuma',
    email: '',
    phone: '+91 98765 43210',
    whatsapp: '',
    preferredMethod: 'phone',
  });
  assert.equal(resGoodPhone.isValid, true);
  assert.equal(Object.keys(resGoodPhone.errors).length, 0);

  // Preferred Phone: missing phone fails
  const resMissingPhone = validateContactDetails({
    name: 'Kusuma',
    email: 'test@example.com',
    phone: '',
    whatsapp: '',
    preferredMethod: 'phone',
  });
  assert.equal(resMissingPhone.isValid, false);
  assert.match(resMissingPhone.errors.phone, /Phone number/);

  // Preferred WhatsApp: missing whatsapp fails
  const resMissingWhatsapp = validateContactDetails({
    name: 'Kusuma',
    email: '',
    phone: '',
    whatsapp: '',
    preferredMethod: 'whatsapp',
  });
  assert.equal(resMissingWhatsapp.isValid, false);
  assert.match(resMissingWhatsapp.errors.whatsapp, /WhatsApp/);

  // Preferred WhatsApp: valid whatsapp passes
  const resGoodWhatsapp = validateContactDetails({
    name: 'Kusuma',
    email: '',
    phone: '',
    whatsapp: '+91 98765 43210',
    preferredMethod: 'whatsapp',
  });
  assert.equal(resGoodWhatsapp.isValid, true);
});

test('validateAttachment enforces file size limit and image formats', () => {
  // Valid PNG within 5MB
  const validPng = validateAttachment({
    name: 'screen_parcel.png',
    size: 2 * 1024 * 1024,
    type: 'image/png',
  });
  assert.equal(validPng.isValid, true);

  // Valid WebP
  const validWebp = validateAttachment({
    name: 'tracking.webp',
    size: 500 * 1024,
    type: 'image/webp',
  });
  assert.equal(validWebp.isValid, true);

  // Too large (>5MB)
  const tooLarge = validateAttachment({
    name: 'huge.jpg',
    size: MAX_ATTACHMENT_BYTES + 1024,
    type: 'image/jpeg',
  });
  assert.equal(tooLarge.isValid, false);
  assert.match(tooLarge.error!, /exceeds the maximum/);

  // Disallowed type (e.g. PDF or executable)
  const badType = validateAttachment({
    name: 'document.pdf',
    size: 100 * 1024,
    type: 'application/pdf',
  });
  assert.equal(badType.isValid, false);
  assert.match(badType.error!, /Unsupported attachment type/);
});
