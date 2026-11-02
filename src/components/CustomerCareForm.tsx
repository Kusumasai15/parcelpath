import React, { useState, useEffect, useRef } from 'react';
import { Shipment, UserProfile, SupportTicket } from '../types';
import {
  SUPPORT_CATEGORIES,
  SupportCategoryValue,
  validateContactDetails,
  validateAttachment,
  isShipmentRequiredForCategory,
  getCategoryLabel,
} from '../utils/support';

interface CustomerCareFormProps {
  currentUser: UserProfile | null;
  shipments: Shipment[];
  sessionToken: string | null;
  supportConfig: {
    configured: boolean;
    supportEmail: string | null;
    supportPhone: string | null;
    supportWhatsapp?: string | null;
    hours: string;
    message?: string;
  };
  onSuccessTicket: (ticket: SupportTicket) => void;
  onOpenFeedback: () => void;
  onNavigateToIssues: () => void;
}

export const CustomerCareForm: React.FC<CustomerCareFormProps> = ({
  currentUser,
  shipments,
  sessionToken,
  supportConfig,
  onSuccessTicket,
  onOpenFeedback,
  onNavigateToIssues,
}) => {
  // LEFT CARD: Contact details state (prefilled from profile, editable, strictly not overwriting saved profile)
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [preferredMethod, setPreferredMethod] = useState<'email' | 'phone' | 'whatsapp'>('email');

  // RIGHT CARD: Issue details state
  const [selectedShipmentOption, setSelectedShipmentOption] = useState<string>('first_available');
  const [manualTrackingId, setManualTrackingId] = useState('');
  const [manualCourier, setManualCourier] = useState('delhivery');
  const [issueCategory, setIssueCategory] = useState<SupportCategoryValue>('delivery_delayed');
  const [description, setDescription] = useState('');

  // Attachment state
  const [attachment, setAttachment] = useState<{
    name: string;
    size: number;
    type: string;
    dataUrl: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Submission & Status
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);

  // Prefill contact details from signed-in user's profile once loaded
  useEffect(() => {
    if (currentUser) {
      if (!contactName) setContactName(currentUser.name || '');
      if (!contactEmail) setContactEmail(currentUser.email || '');
    }
  }, [currentUser]);

  // Set default selected shipment option
  useEffect(() => {
    if (selectedShipmentOption === 'first_available') {
      const firstActive = shipments.find((s) => s.status !== 'Delivered');
      if (firstActive) {
        setSelectedShipmentOption(firstActive.id);
      } else if (shipments.length > 0) {
        setSelectedShipmentOption(shipments[0].id);
      } else {
        setSelectedShipmentOption('no_shipment');
      }
    }
  }, [shipments, selectedShipmentOption]);

  // When "Same as phone number" is toggled
  const handleSameAsPhoneToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSameAsPhone(checked);
    if (checked) {
      setContactWhatsapp(contactPhone);
      if (formErrors.whatsapp) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next.whatsapp;
          return next;
        });
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setContactPhone(val);
    if (sameAsPhone) {
      setContactWhatsapp(val);
    }
  };

  // Handle screenshot file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.isValid) {
      setFormErrors((prev) => ({
        ...prev,
        attachment: validation.error || 'Invalid attachment.',
      }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Clear previous attachment error
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.attachment;
      return next;
    });

    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.attachment;
      return next;
    });
  };

  const isShipmentRequired = isShipmentRequiredForCategory(issueCategory);

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);

    // 1. Validate contact details
    const contactValidation = validateContactDetails({
      name: contactName,
      email: contactEmail,
      phone: contactPhone,
      whatsapp: contactWhatsapp,
      preferredMethod,
    });

    const errors: Record<string, string> = { ...contactValidation.errors };

    // 2. Validate shipment requirement
    if (isShipmentRequired) {
      if (selectedShipmentOption === 'no_shipment') {
        errors.shipment = 'This issue category relates to a delivery. Please select a parcel or choose manual entry.';
      } else if (selectedShipmentOption === 'manual') {
        if (!manualTrackingId.trim()) {
          errors.manualTracking = 'Please enter the tracking number (AWB) for the affected parcel.';
        }
      }
    }

    // 3. Validate description
    if (!description.trim()) {
      errors.description = 'Please explain what happened and when in the description.';
    } else if (description.trim().length < 8) {
      errors.description = 'Please provide a few more details so Customer Care can assist you.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    try {
      // Find selected shipment details if applicable
      const matchedShipment = shipments.find((s) => s.id === selectedShipmentOption);
      const isManual = selectedShipmentOption === 'manual';
      const isNoShipment = selectedShipmentOption === 'no_shipment';

      const payload = {
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        contactWhatsapp: contactWhatsapp.trim(),
        preferredContactMethod: preferredMethod,
        shipmentId: (!isManual && !isNoShipment && matchedShipment) ? matchedShipment.id : undefined,
        shipmentLabel: (!isManual && !isNoShipment && matchedShipment)
          ? `${matchedShipment.item} (${matchedShipment.trackingNumber})`
          : (isManual ? `Manual AWB: ${manualTrackingId.trim()}` : undefined),
        trackingNumber: isManual ? manualTrackingId.trim() : (matchedShipment ? matchedShipment.trackingNumber : undefined),
        courier: isManual ? manualCourier : (matchedShipment ? matchedShipment.courier : undefined),
        isManualTracking: isManual,
        category: issueCategory,
        categoryLabel: getCategoryLabel(issueCategory),
        description: description.trim(),
        attachmentName: attachment?.name,
        attachmentDataUrl: attachment?.dataUrl,
        attachmentSize: attachment?.size,
        attachmentType: attachment?.type,
      };

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server rejected the support request. Please try again.');
      }

      // Success
      setSubmittedTicket(data.ticket);
      onSuccessTicket(data.ticket);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit support request. Backend may be offline.';
      setSubmissionError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSubmittedTicket(null);
    setDescription('');
    setAttachment(null);
    setFormErrors({});
    setSubmissionError(null);
  };

  return (
    <div className="customer-care-container">
      {/* SUCCESS CONFIRMATION STATE */}
      {submittedTicket ? (
        <article
          className="care-card success-card"
          style={{
            maxWidth: '720px',
            margin: '0 auto 24px',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid #48bb78',
            backgroundColor: 'color-mix(in srgb, #48bb78 10%, var(--surface))',
          }}
          aria-live="polite"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#48bb78',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: '#48bb78',
                }}
              >
                Request Logged
              </span>
              <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 600 }}>
                Support request received: {submittedTicket.ticketRef}
              </h2>
            </div>
          </div>

          <p style={{ fontSize: '12px', lineHeight: '1.6', margin: '0 0 16px', color: 'var(--ink)' }}>
            Thank you, <strong>{submittedTicket.contactName || submittedTicket.userName}</strong>. Your support request has been logged in your ParcelPath account.
            Our customer care team has received your details and will investigate the matter.
          </p>

          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
              fontSize: '11px',
              display: 'grid',
              gap: '8px',
              marginBottom: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Reference Number:</span>
              <strong>{submittedTicket.ticketRef}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Issue Category:</span>
              <strong>{submittedTicket.categoryLabel || getCategoryLabel(submittedTicket.category)}</strong>
            </div>
            {submittedTicket.shipmentLabel && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Parcel:</span>
                <strong>{submittedTicket.shipmentLabel}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Follow-up Channel:</span>
              <strong style={{ textTransform: 'capitalize' }}>
                {submittedTicket.preferredContactMethod || 'Email'} (
                {submittedTicket.preferredContactMethod === 'phone'
                  ? submittedTicket.contactPhone
                  : submittedTicket.preferredContactMethod === 'whatsapp'
                  ? submittedTicket.contactWhatsapp || submittedTicket.contactPhone
                  : submittedTicket.contactEmail || submittedTicket.userEmail}
                )
              </strong>
            </div>
            {submittedTicket.attachmentName && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Screenshot:</span>
                <span>📎 {submittedTicket.attachmentName}</span>
              </div>
            )}
          </div>

          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              borderLeft: '3px solid var(--coral)',
              backgroundColor: 'color-mix(in srgb, var(--mauve) 25%, transparent)',
              fontSize: '11px',
              color: 'var(--muted)',
              marginBottom: '20px',
              lineHeight: '1.45',
            }}
          >
            <strong>Service Notice:</strong> Submitting a request records it in the ParcelPath desk. It does not initiate automated phone calls or WhatsApp messages, and does not constitute a courier carrier claim unless confirmed by a courier representative.
          </div>

          <div className="simple-actions" style={{ marginTop: '0' }}>
            <button
              type="button"
              className="primary"
              onClick={onNavigateToIssues}
              style={{ padding: '10px 18px', fontSize: '12px' }}
            >
              View in Issues &amp; Feedback →
            </button>
            <button
              type="button"
              onClick={handleResetForm}
              style={{ padding: '10px 16px', fontSize: '12px' }}
            >
              Submit another request
            </button>
          </div>
        </article>
      ) : (
        /* CONNECTED TWO-CARD SUPPORT FORM */
        <form onSubmit={handleSubmit} noValidate>
          {submissionError && (
            <div
              role="alert"
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(238, 83, 83, 0.12)',
                border: '1px solid #ee5353',
                color: '#fc8181',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{submissionError}</span>
            </div>
          )}

          <div className="care-grid">
            {/* LEFT CARD — “Your contact details” */}
            <article className="care-card" aria-labelledby="card-contact-title">
              <h2 id="card-contact-title">Your contact details</h2>
              <p>Provide your contact details so our team can follow up regarding your request.</p>

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                {/* Name */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-name" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Your name
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--coral)', fontWeight: 600 }}>* Required</span>
                  </div>
                  <input
                    id="care-name"
                    type="text"
                    value={contactName}
                    onChange={(e) => {
                      setContactName(e.target.value);
                      if (formErrors.name) setFormErrors((p) => { const n = { ...p }; delete n.name; return n; });
                    }}
                    placeholder="e.g. Kusuma Sai"
                    aria-invalid={!!formErrors.name}
                    aria-describedby={formErrors.name ? 'care-name-err' : undefined}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.name ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                  {formErrors.name && (
                    <span id="care-name-err" style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.name}
                    </span>
                  )}
                </div>

                {/* Preferred Contact Method */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Preferred contact method
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--coral)', fontWeight: 600 }}>* Required</span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Preferred contact method"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                    }}
                  >
                    {(['email', 'phone', 'whatsapp'] as const).map((method) => {
                      const isSelected = preferredMethod === method;
                      const label = method === 'email' ? 'Email' : method === 'phone' ? 'Phone' : 'WhatsApp';
                      return (
                        <button
                          key={method}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setPreferredMethod(method)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: isSelected ? '1px solid var(--coral)' : '1px solid var(--line)',
                            background: isSelected
                              ? 'color-mix(in srgb, var(--coral) 18%, var(--surface))'
                              : 'var(--page)',
                            color: isSelected ? 'var(--coral)' : 'var(--ink)',
                            fontWeight: isSelected ? 600 : 400,
                            fontSize: '11px',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                          }}
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isSelected ? 'var(--coral)' : 'transparent',
                              border: isSelected ? 'none' : '1px solid var(--line)',
                            }}
                          />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-email" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Email address
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        color: preferredMethod === 'email' ? 'var(--coral)' : 'var(--muted)',
                        fontWeight: preferredMethod === 'email' ? 600 : 400,
                      }}
                    >
                      {preferredMethod === 'email' ? '* Required' : '(Optional)'}
                    </span>
                  </div>
                  <input
                    id="care-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      if (formErrors.email) setFormErrors((p) => { const n = { ...p }; delete n.email; return n; });
                    }}
                    placeholder="name@example.com"
                    aria-invalid={!!formErrors.email}
                    aria-describedby={formErrors.email ? 'care-email-err' : undefined}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.email ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                  {formErrors.email && (
                    <span id="care-email-err" style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.email}
                    </span>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-phone" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Phone number (with country code)
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        color: preferredMethod === 'phone' ? 'var(--coral)' : 'var(--muted)',
                        fontWeight: preferredMethod === 'phone' ? 600 : 400,
                      }}
                    >
                      {preferredMethod === 'phone' ? '* Required' : '(Optional)'}
                    </span>
                  </div>
                  <input
                    id="care-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={handlePhoneChange}
                    placeholder="+91 98765 43210"
                    aria-invalid={!!formErrors.phone}
                    aria-describedby={formErrors.phone ? 'care-phone-err' : undefined}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.phone ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                  {formErrors.phone && (
                    <span id="care-phone-err" style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.phone}
                    </span>
                  )}
                </div>

                {/* WhatsApp Number with "Same as phone number" checkbox */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-whatsapp" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      WhatsApp number
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        color: preferredMethod === 'whatsapp' ? 'var(--coral)' : 'var(--muted)',
                        fontWeight: preferredMethod === 'whatsapp' ? 600 : 400,
                      }}
                    >
                      {preferredMethod === 'whatsapp' ? '* Required' : '(Optional)'}
                    </span>
                  </div>

                  <div style={{ marginBottom: '6px' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={sameAsPhone}
                        onChange={handleSameAsPhoneToggle}
                        style={{ accentColor: 'var(--coral)', cursor: 'pointer' }}
                      />
                      Same as phone number
                    </label>
                  </div>

                  <input
                    id="care-whatsapp"
                    type="tel"
                    value={contactWhatsapp}
                    onChange={(e) => {
                      setContactWhatsapp(e.target.value);
                      if (formErrors.whatsapp) setFormErrors((p) => { const n = { ...p }; delete n.whatsapp; return n; });
                    }}
                    disabled={sameAsPhone}
                    placeholder="+91 98765 43210"
                    aria-invalid={!!formErrors.whatsapp}
                    aria-describedby={formErrors.whatsapp ? 'care-whatsapp-err' : undefined}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.whatsapp ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: sameAsPhone ? 'color-mix(in srgb, var(--surface) 80%, var(--mauve))' : 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                      opacity: sameAsPhone ? 0.8 : 1,
                    }}
                  />
                  {formErrors.whatsapp && (
                    <span id="care-whatsapp-err" style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.whatsapp}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    padding: '8px 11px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, var(--surface) 90%, var(--mauve))',
                    fontSize: '10px',
                    color: 'var(--muted)',
                    lineHeight: '1.45',
                  }}
                >
                  🔒 <em>These contact details are used solely to follow up on this support request and will not overwrite your default account profile.</em>
                </div>
              </div>
            </article>

            {/* RIGHT CARD — “Tell us about your issue” */}
            <article className="care-card" aria-labelledby="card-issue-title">
              <h2 id="card-issue-title">Tell us about your issue</h2>
              <p>Select an affected shipment or report a general tracking or website problem.</p>

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                {/* Issue Category */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-issue-category" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Issue category
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--coral)', fontWeight: 600 }}>* Required</span>
                  </div>
                  <select
                    id="care-issue-category"
                    value={issueCategory}
                    onChange={(e) => setIssueCategory(e.target.value as SupportCategoryValue)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  >
                    {SUPPORT_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shipment selector */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-shipment" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Affected shipment
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        color: isShipmentRequired ? 'var(--coral)' : 'var(--muted)',
                        fontWeight: isShipmentRequired ? 600 : 400,
                      }}
                    >
                      {isShipmentRequired ? '* Required' : '(Optional)'}
                    </span>
                  </div>
                  <select
                    id="care-shipment"
                    value={selectedShipmentOption}
                    onChange={(e) => {
                      setSelectedShipmentOption(e.target.value);
                      if (formErrors.shipment) setFormErrors((p) => { const n = { ...p }; delete n.shipment; return n; });
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.shipment ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  >
                    {shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.item} · {s.courierName} ({s.trackingNumber}) [{s.status}]
                      </option>
                    ))}
                    <option value="manual">Enter tracking ID manually</option>
                    <option value="no_shipment">Website issue / no shipment</option>
                  </select>
                  {formErrors.shipment && (
                    <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.shipment}
                    </span>
                  )}
                </div>

                {/* Conditional Manual Tracking Input */}
                {selectedShipmentOption === 'manual' && (
                  <div
                    style={{
                      padding: '12px',
                      borderRadius: '9px',
                      backgroundColor: 'color-mix(in srgb, var(--surface) 88%, var(--mauve))',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label htmlFor="care-manual-tracking" style={{ fontSize: '10px', fontWeight: 500, color: 'var(--ink)' }}>
                          Tracking ID / AWB
                        </label>
                        <span style={{ fontSize: '9px', color: 'var(--coral)', fontWeight: 600 }}>* Required</span>
                      </div>
                      <input
                        id="care-manual-tracking"
                        type="text"
                        value={manualTrackingId}
                        onChange={(e) => {
                          setManualTrackingId(e.target.value);
                          if (formErrors.manualTracking) setFormErrors((p) => { const n = { ...p }; delete n.manualTracking; return n; });
                        }}
                        placeholder="e.g. 123456789012"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: formErrors.manualTracking ? '1px solid #ee5353' : '1px solid var(--line)',
                          background: 'var(--page)',
                          color: 'var(--ink)',
                          fontSize: '11px',
                        }}
                      />
                      {formErrors.manualTracking && (
                        <span style={{ display: 'block', marginTop: '3px', fontSize: '10px', color: '#ee5353' }}>
                          {formErrors.manualTracking}
                        </span>
                      )}
                    </div>

                    <div>
                      <label htmlFor="care-manual-courier" style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'var(--ink)', marginBottom: '4px' }}>
                        Courier partner
                      </label>
                      <select
                        id="care-manual-courier"
                        value={manualCourier}
                        onChange={(e) => setManualCourier(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          background: 'var(--page)',
                          color: 'var(--ink)',
                          fontSize: '11px',
                        }}
                      >
                        <option value="delhivery">Delhivery</option>
                        <option value="bluedart">Blue Dart</option>
                        <option value="ekart">Ekart Logistics</option>
                        <option value="dtdc">DTDC</option>
                        <option value="indiapost">India Post</option>
                        <option value="amazon_shipping">Amazon Shipping</option>
                        <option value="other">Other / Unknown</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Multiline Description */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-description" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Details of what happened
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--coral)', fontWeight: 600 }}>* Required</span>
                  </div>
                  <textarea
                    id="care-description"
                    rows={4}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (formErrors.description) setFormErrors((p) => { const n = { ...p }; delete n.description; return n; });
                    }}
                    placeholder="Explain what happened and when."
                    aria-invalid={!!formErrors.description}
                    aria-describedby={formErrors.description ? 'care-desc-err' : undefined}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: formErrors.description ? '1px solid #ee5353' : '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                      resize: 'vertical',
                    }}
                  />
                  {formErrors.description && (
                    <span id="care-desc-err" style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.description}
                    </span>
                  )}
                </div>

                {/* Optional Screenshot Attachment */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="care-screenshot" style={{ fontSize: '11px', fontWeight: 500, color: 'var(--ink)' }}>
                      Attach screenshot
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>(Optional, PNG/JPG/WebP, max 5MB)</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    id="care-screenshot"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />

                  {attachment ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        backgroundColor: 'var(--page)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                        <img
                          src={attachment.dataUrl}
                          alt="Thumbnail preview"
                          style={{
                            width: '32px',
                            height: '32px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ overflow: 'hidden' }}>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '11px',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {attachment.name}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            {(attachment.size / 1024).toFixed(0)} KB · Verified secure
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAttachment}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          background: 'transparent',
                          color: '#ee5353',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px dashed var(--line)',
                        background: 'var(--page)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'border-color 150ms ease',
                      }}
                    >
                      <span>📎</span> Choose image or screenshot to upload
                    </button>
                  )}

                  {formErrors.attachment && (
                    <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: '#ee5353' }}>
                      {formErrors.attachment}
                    </span>
                  )}
                </div>
              </div>
            </article>
          </div>

          {/* CONNECTED SUBMISSION BAR */}
          <div
            style={{
              marginTop: '20px',
              padding: '18px 20px',
              borderRadius: '13px',
              border: '1px solid var(--line)',
              backgroundColor: 'color-mix(in srgb, var(--surface) 94%, var(--mauve))',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', maxWidth: '580px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--ink)' }}>Support Desk Dispatch:</strong> Submitting a request saves it directly under your account in Issues &amp; Feedback. It does not trigger automatic phone calls or WhatsApp messages.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onOpenFeedback}
                style={{
                  padding: '11px 16px',
                  borderRadius: '9px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  font: 'inherit',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Send feedback
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="primary"
                style={{
                  padding: '11px 20px',
                  borderRadius: '9px',
                  border: '0',
                  background: 'var(--coral)',
                  color: 'var(--coral-ink)',
                  font: 'inherit',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {submitting ? 'Submitting support request...' : 'Submit support request'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* OFFICIAL SUPPORT CHANNELS (SEPARATE SMALL AREA) */}
      <section
        style={{
          marginTop: '28px',
          padding: '18px',
          borderRadius: '13px',
          border: '1px solid var(--line)',
          backgroundColor: 'color-mix(in srgb, var(--surface) 92%, var(--mauve))',
        }}
        aria-labelledby="official-contacts-heading"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <h3 id="official-contacts-heading" style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
            Official Support Contacts
          </h3>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
            Administered channels
          </span>
        </div>

        {supportConfig.configured ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '11px' }}>
            {supportConfig.supportEmail && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--page)', border: '1px solid var(--line)' }}>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>Official Support Email</span>
                <strong style={{ color: 'var(--ink)', fontSize: '12px' }}>{supportConfig.supportEmail}</strong>
              </div>
            )}
            {supportConfig.supportPhone && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--page)', border: '1px solid var(--line)' }}>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>Phone / WhatsApp Hotline</span>
                <strong style={{ color: 'var(--ink)', fontSize: '12px' }}>{supportConfig.supportPhone}</strong>
              </div>
            )}
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--page)', border: '1px solid var(--line)' }}>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>Business Hours</span>
              <strong style={{ color: 'var(--ink)', fontSize: '12px' }}>{supportConfig.hours}</strong>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'var(--page)',
              border: '1px solid var(--line)',
              fontSize: '11px',
              color: 'var(--muted)',
              lineHeight: '1.5',
            }}
          >
            <p style={{ margin: 0 }}>
              Official support telephone and WhatsApp lines are currently not configured for direct inbound dialing.
              Please submit a support request using the form above; our support staff monitors and resolves all tickets directly in <strong>Issues &amp; Feedback</strong>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
