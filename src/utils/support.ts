/**
 * Pure support validation, categorization, and attachment handling logic
 */

export interface ContactDetails {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  preferredMethod: 'email' | 'phone' | 'whatsapp';
}

export interface SupportValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const SUPPORT_CATEGORIES = [
  { value: 'delivery_delayed', label: 'Delivery delayed', isShipmentRelated: true },
  { value: 'missed_delivery', label: 'Delivery attempted / missed delivery', isShipmentRelated: true },
  { value: 'delivered_not_received', label: 'Delivered but not received', isShipmentRelated: true },
  { value: 'damaged_parcel', label: 'Damaged parcel', isShipmentRelated: true },
  { value: 'wrong_item_received', label: 'Wrong item received', isShipmentRelated: true },
  { value: 'tracking_not_updating', label: 'Tracking not updating', isShipmentRelated: true },
  { value: 'incorrect_delivery_info', label: 'Incorrect delivery information', isShipmentRelated: true },
  { value: 'website_account_issue', label: 'Website or account problem', isShipmentRelated: false },
  { value: 'other', label: 'Other', isShipmentRelated: false },
] as const;

export type SupportCategoryValue = typeof SUPPORT_CATEGORIES[number]['value'];

export function isShipmentRequiredForCategory(categoryValue: string): boolean {
  const found = SUPPORT_CATEGORIES.find((c) => c.value === categoryValue);
  return found ? found.isShipmentRelated : false;
}

export function getCategoryLabel(categoryValue: string): string {
  const found = SUPPORT_CATEGORIES.find((c) => c.value === categoryValue);
  if (found) return found.label;
  // Handle legacy or unknown category values cleanly
  return categoryValue
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MIN_DIGITS = 7;

export function validateContactDetails(contact: ContactDetails): SupportValidationResult {
  const errors: Record<string, string> = {};

  // 1. Name is always required
  if (!contact.name || contact.name.trim().length < 2) {
    errors.name = 'Please enter your full name.';
  }

  // 2. Validate email format if provided or required
  const cleanEmail = contact.email ? contact.email.trim() : '';
  if (contact.preferredMethod === 'email') {
    if (!cleanEmail) {
      errors.email = 'Email address is required when Email is your preferred contact method.';
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      errors.email = 'Please enter a valid email address (e.g. name@example.com).';
    }
  } else if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
    errors.email = 'Please enter a valid email address.';
  }

  // 3. Validate phone format if provided or required
  const digitsOnlyPhone = contact.phone ? contact.phone.replace(/\D/g, '') : '';
  if (contact.preferredMethod === 'phone') {
    if (!contact.phone || !contact.phone.trim()) {
      errors.phone = 'Phone number with country code is required when Phone is preferred.';
    } else if (digitsOnlyPhone.length < PHONE_MIN_DIGITS) {
      errors.phone = 'Please provide a valid phone number including country code (e.g. +91 98765 43210).';
    }
  } else if (contact.phone && contact.phone.trim() && digitsOnlyPhone.length < PHONE_MIN_DIGITS) {
    errors.phone = 'Please enter a valid phone number with country code.';
  }

  // 4. Validate WhatsApp format if provided or required
  const digitsOnlyWhatsapp = contact.whatsapp ? contact.whatsapp.replace(/\D/g, '') : '';
  if (contact.preferredMethod === 'whatsapp') {
    if (!contact.whatsapp || !contact.whatsapp.trim()) {
      errors.whatsapp = 'WhatsApp number is required when WhatsApp is your preferred contact method.';
    } else if (digitsOnlyWhatsapp.length < PHONE_MIN_DIGITS) {
      errors.whatsapp = 'Please provide a valid WhatsApp number with country code.';
    }
  } else if (contact.whatsapp && contact.whatsapp.trim() && digitsOnlyWhatsapp.length < PHONE_MIN_DIGITS) {
    errors.whatsapp = 'Please enter a valid WhatsApp number with country code.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface AttachmentValidationResult {
  isValid: boolean;
  error?: string;
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export function validateAttachment(file: { name: string; size: number; type: string }): AttachmentValidationResult {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `Attachment size (${sizeMb} MB) exceeds the maximum allowed 5 MB limit.`,
    };
  }

  const normalizedType = file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();

  const isTypeAllowed =
    ALLOWED_IMAGE_TYPES.includes(normalizedType) ||
    ['png', 'jpg', 'jpeg', 'webp'].includes(extension || '');

  if (!isTypeAllowed) {
    return {
      isValid: false,
      error: 'Unsupported attachment type. Only PNG, JPEG, and WebP images are accepted.',
    };
  }

  return { isValid: true };
}
