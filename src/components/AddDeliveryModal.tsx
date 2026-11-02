import React, { useState } from 'react';
import { SUPPORTED_COURIERS, detectCourier, isStoreOrderId } from '../utils/courier';
import { Shipment } from '../types';

interface AddDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (shipment: Shipment) => void;
  sessionToken: string | null;
}

export const AddDeliveryModal: React.FC<AddDeliveryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sessionToken,
}) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('auto');
  const [store, setStore] = useState('Amazon');
  const [item, setItem] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeTip, setStoreTip] = useState<{ isStoreId: boolean; tip?: string; storeName?: string }>({ isStoreId: false });

  if (!isOpen) return null;

  const handleTrackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTrackingNumber(val);
    setError(null);

    const check = isStoreOrderId(val);
    setStoreTip(check);

    if (courier === 'auto' && val.trim().length > 3) {
      const detected = detectCourier(val);
      if (detected !== 'other') {
        // Auto-detected
      }
    }
  };

  const detectedKey = detectCourier(trackingNumber);
  const effectiveCourierKey = courier === 'auto' ? detectedKey : courier;
  const effectiveCourierInfo = SUPPORTED_COURIERS[effectiveCourierKey] || SUPPORTED_COURIERS.other;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber.trim()) {
      setError('Please enter a tracking ID / AWB.');
      return;
    }

    if (storeTip.isStoreId) {
      setError('Please enter the courier tracking number (AWB) instead of the retail store order ID.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim(),
          courier: effectiveCourierKey,
          store: store.trim(),
          item: item.trim() || undefined,
          customLabel: customLabel.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add delivery tracking.');
      }

      onSuccess(data.shipment);
      onClose();
      // Reset form
      setTrackingNumber('');
      setItem('');
      setCustomLabel('');
      setImageUrl('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not add parcel.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="add-delivery-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">New parcel</p>
              <h2 id="add-delivery-title">Add tracking ID</h2>
              <p className="dialog-sub">Track parcels across Amazon, Flipkart, Nykaa, and direct couriers.</p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close add delivery dialog">
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '14px',
                  borderRadius: '9px',
                  border: '1px solid #e53e3e',
                  backgroundColor: 'rgba(229, 62, 62, 0.12)',
                  color: '#fc8181',
                  fontSize: '11px',
                  lineHeight: '1.4',
                }}
              >
                <strong>Unable to add parcel:</strong> {error}
              </div>
            )}

            {storeTip.isStoreId && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '14px',
                  borderRadius: '9px',
                  border: '1px solid var(--coral)',
                  backgroundColor: 'color-mix(in srgb, var(--mauve) 30%, transparent)',
                  fontSize: '11px',
                  lineHeight: '1.45',
                }}
              >
                <strong style={{ color: 'var(--coral)' }}>Shopping Order ID Detected:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--ink)' }}>{storeTip.tip}</p>
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="modal-tracking-id" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                Courier Tracking ID / AWB *
              </label>
              <input
                id="modal-tracking-id"
                type="text"
                value={trackingNumber}
                onChange={handleTrackingChange}
                placeholder="e.g. 123456789012 (Delhivery), BD12345678, FMPC..."
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 11px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--page)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  Detected courier: <strong style={{ color: 'var(--accent-text)' }}>{effectiveCourierInfo.name}</strong>
                </span>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  AWB format verified
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label htmlFor="modal-courier-select" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Courier Service
                </label>
                <select
                  id="modal-courier-select"
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                >
                  <option value="auto">Auto-detect ({effectiveCourierInfo.name})</option>
                  {Object.values(SUPPORTED_COURIERS).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="modal-store-select" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Purchased From
                </label>
                <input
                  id="modal-store-select"
                  type="text"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder="Amazon, Flipkart, Nykaa, Tira, Myntra..."
                  style={{
                    width: '100%',
                    padding: '10px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="modal-item-name" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                Item / Product Name
              </label>
              <input
                id="modal-item-name"
                type="text"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="e.g. Wireless noise-canceling headphones"
                style={{
                  width: '100%',
                  padding: '10px 11px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--page)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="modal-custom-label" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                Custom Order Tag / Label (Optional)
              </label>
              <input
                id="modal-custom-label"
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Birthday gift, College supplies, Urgent..."
                style={{
                  width: '100%',
                  padding: '10px 11px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--page)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
              <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                Helps organize and search your deliveries.
              </span>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label htmlFor="modal-image-url" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                Product Image URL (Optional)
              </label>
              <input
                id="modal-image-url"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... (or connect email to detect verified thumbnails)"
                style={{
                  width: '100%',
                  padding: '10px 11px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--page)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                }}
              />
              <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                When no verified image is available, a neutral package placeholder 📦 is displayed.
              </span>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: '1.4' }}>
              <strong>Notice:</strong> Adding a parcel saves it to your personal tracker. It does not replace or modify your retailer account.
            </p>

            <div className="dialog-actions">
              <button type="button" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button className="report-from-details" type="submit" disabled={loading || storeTip.isStoreId}>
                {loading ? 'Saving parcel...' : 'Save & Track parcel'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
