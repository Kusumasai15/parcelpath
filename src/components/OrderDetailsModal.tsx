import React, { useState } from 'react';
import { Shipment } from '../types';
import { SUPPORTED_COURIERS, formatRelativeTime, getShipmentProgress } from '../utils/courier';

interface OrderDetailsModalProps {
  shipment: Shipment | null;
  isOpen: boolean;
  onClose: () => void;
  onReportIssue: (shipment: Shipment) => void;
  onDeleteShipment: (shipmentId: string) => Promise<void>;
  onRefreshShipment: (shipmentId: string) => Promise<void>;
  onUpdateLabel?: (shipmentId: string, newLabel: string) => Promise<void>;
  sessionToken: string | null;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  shipment,
  isOpen,
  onClose,
  onReportIssue,
  onDeleteShipment,
  onRefreshShipment,
  onUpdateLabel,
  sessionToken,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Custom label edit mode
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  // "I won't be home" dialog state
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [rescheduleData, setRescheduleData] = useState<{
    message: string;
    officialPortalUrl: string;
    backupRecipientRecommendation: string;
  } | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  if (!isOpen || !shipment) return null;

  const courierInfo = SUPPORTED_COURIERS[shipment.courier] || SUPPORTED_COURIERS.other;
  const officialTrackingLink = courierInfo.trackingUrl(shipment.trackingNumber.replace(/^…/, ''));
  const progress = getShipmentProgress(shipment.status);

  const handleCopyTracking = () => {
    navigator.clipboard.writeText(shipment.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshShipment(shipment.id);
    setIsRefreshing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDeleteShipment(shipment.id);
    setIsDeleting(false);
    setConfirmDelete(false);
    onClose();
  };

  const handleSaveLabel = async () => {
    if (!onUpdateLabel) return;
    setSavingLabel(true);
    await onUpdateLabel(shipment.id, labelInput);
    setSavingLabel(false);
    setIsEditingLabel(false);
  };

  const handleWontBeHomeClick = async () => {
    setRescheduleLoading(true);
    setShowRescheduleDialog(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      const data = await res.json();
      setRescheduleData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const isAttempted = shipment.status.toLowerCase().includes('attempted') || shipment.status.toLowerCase().includes('delayed');

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="custom-modal order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        style={{ display: 'block' }}
      >
        <div className="dialog-content">
          <div className="dialog-head">
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                className="merchant"
                style={{
                  flex: '0 0 42px',
                  width: '42px',
                  height: '42px',
                  borderRadius: '11px',
                  backgroundColor: 'var(--mauve)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: shipment.imageUrl ? '10px' : '20px',
                  overflow: 'hidden',
                }}
              >
                {shipment.imageUrl ? (
                  <img src={shipment.imageUrl} alt={shipment.item} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '📦'
                )}
              </div>
              <div>
                <p className="dialog-kicker">
                  Parcel details {shipment.isDemo && '· Demo Package'}
                  {shipment.customLabel && (
                    <span className="custom-label-badge" style={{ textTransform: 'none' }}>
                      🏷 {shipment.customLabel}
                    </span>
                  )}
                </p>
                <h2 id="detail-title">{shipment.item}</h2>
                <p className="dialog-sub" id="detail-store">
                  {shipment.store} · Tracking {shipment.trackingNumber}
                </p>
              </div>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close order details">
              ×
            </button>
          </div>

          {/* Custom Label Quick Editor */}
          <div
            style={{
              margin: '12px 0',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
            }}
          >
            {isEditingLabel ? (
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="e.g. Birthday gift, Urgent..."
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '11px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveLabel}
                  disabled={savingLabel}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'var(--coral)',
                    color: 'var(--coral-ink)',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingLabel(false)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: 'var(--muted)',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span style={{ color: 'var(--muted)' }}>
                  Custom tag:{' '}
                  <strong style={{ color: 'var(--ink)' }}>
                    {shipment.customLabel || 'No tag added'}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLabelInput(shipment.customLabel || '');
                    setIsEditingLabel(true);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-text)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: 0,
                  }}
                >
                  ✎ {shipment.customLabel ? 'Edit tag' : 'Add tag'}
                </button>
              </>
            )}
          </div>

          {/* Hero status & ETA */}
          <div className="detail-hero">
            <span className={isAttempted ? 'status alert' : 'status'} id="detail-status">
              <i />
              <span>{shipment.status}</span>
            </span>
            <div className="detail-eta">
              <span>Estimated arrival</span>
              <strong id="detail-eta-value">
                {shipment.timeWindow || shipment.eta || 'Time not available'}
              </strong>
            </div>
          </div>

          {/* Progress Indicator */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginBottom: '4px' }}>
              <span>Delivery progress: <strong style={{ color: progress.isAlert ? 'var(--coral)' : 'var(--ink)' }}>{progress.label}</strong></span>
              <span>{progress.percentage}%</span>
            </div>
            <div className="delivery-progress-track" style={{ height: '5px' }}>
              <div
                className={`delivery-progress-bar ${progress.isAlert ? 'is-alert' : ''}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>

          {/* Fact cards */}
          <div className="detail-facts">
            <div className="detail-fact">
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Tracking ID
                <button
                  type="button"
                  onClick={handleCopyTracking}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: copied ? 'var(--accent-text)' : 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '10px',
                    padding: 0,
                  }}
                  aria-label="Copy tracking ID"
                >
                  {copied ? '✓ Copied' : 'Copy ↗'}
                </button>
              </span>
              <strong id="detail-tracking">{shipment.trackingNumber}</strong>
            </div>

            <div className="detail-fact">
              <span>Courier</span>
              <strong id="detail-courier">{shipment.courierName || 'Courier partner'}</strong>
            </div>

            <div className="detail-fact">
              <span>Last scanned location</span>
              <strong id="detail-location">{shipment.location || 'Hub scan pending'}</strong>
            </div>

            <div className="detail-fact">
              <span>Official tracking</span>
              <strong>
                <a
                  href={officialTrackingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent-text)', textDecoration: 'none' }}
                >
                  View on {courierInfo.name} ↗
                </a>
              </strong>
            </div>
          </div>

          {/* Distinct Timestamps */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'color-mix(in srgb, var(--surface-raised) 70%, var(--mauve))',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '10px',
            }}
          >
            <span>
              Tracker status: <strong style={{ color: 'var(--ink)' }}>{formatRelativeTime(shipment.lastRefreshedAt)}</strong>
            </span>
            {shipment.courierEventTime && (
              <span>
                Courier scan: <strong style={{ color: 'var(--ink)' }}>{shipment.courierEventTime}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="timeline-title" style={{ margin: 0 }}>
              Tracking timeline
            </h3>
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
              {formatRelativeTime(shipment.lastRefreshedAt)}
            </span>
          </div>

          <ol className="tracking-timeline" id="detail-events">
            {shipment.events && shipment.events.length > 0 ? (
              shipment.events.map((event, index) => {
                const isDone = event.isDone !== false;
                return (
                  <li key={index} className={isDone ? 'is-done' : ''}>
                    <i aria-hidden="true" />
                    <strong>{event.title}</strong>
                    <span>{event.time}</span>
                  </li>
                );
              })
            ) : (
              <li>
                <i aria-hidden="true" />
                <strong>Shipment record created</strong>
                <span>Today</span>
              </li>
            )}
          </ol>

          <p className="detail-note">
            Arrival times and location updates are provided by {shipment.courierName || 'the courier'}. We do not fabricate doorstep ETAs or moving driver positions.
          </p>

          {/* "I Won't Be Home" Rescheduling Modal / Panel */}
          {showRescheduleDialog && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                backgroundColor: 'color-mix(in srgb, var(--surface-raised) 90%, var(--mauve))',
                fontSize: '11px',
                lineHeight: '1.45',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--coral)' }}>
                  “I won’t be home” — Rescheduling Information
                </strong>
                <button
                  type="button"
                  onClick={() => setShowRescheduleDialog(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px' }}
                >
                  ×
                </button>
              </div>

              {rescheduleLoading ? (
                <p style={{ margin: 0, color: 'var(--muted)' }}>Checking carrier options...</p>
              ) : rescheduleData ? (
                <>
                  <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>
                    {rescheduleData.message}
                  </p>
                  <p style={{ margin: '0 0 12px', color: 'var(--ink)' }}>
                    {rescheduleData.backupRecipientRecommendation}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {rescheduleData.officialPortalUrl && (
                      <a
                        href={rescheduleData.officialPortalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '7px 12px',
                          borderRadius: '7px',
                          border: '1px solid var(--accent-text)',
                          background: 'transparent',
                          color: 'var(--accent-text)',
                          fontSize: '11px',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        Open {shipment.courierName} Support Portal ↗
                      </a>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {confirmDelete ? (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(229, 62, 62, 0.12)',
                border: '1px solid #e53e3e',
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#fc8181', lineHeight: '1.4' }}>
                Remove this parcel from your tracker? (This only removes the tracking record from ParcelPath. It does not cancel your purchase or stop the carrier shipment).
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '7px',
                    border: '1px solid var(--line)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '7px',
                    border: '1px solid #e53e3e',
                    background: '#e53e3e',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isDeleting ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          ) : (
            <div className="dialog-actions">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                style={{ marginRight: 'auto' }}
              >
                {isRefreshing ? 'Refreshing...' : '↻ Check status'}
              </button>
              {shipment.status !== 'Delivered' && (
                <button
                  type="button"
                  onClick={handleWontBeHomeClick}
                  style={{ borderColor: 'var(--accent-text)', color: 'var(--accent-text)' }}
                >
                  I won’t be home
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{ color: '#fc8181', borderColor: 'rgba(229, 62, 62, 0.4)' }}
              >
                Remove from tracker
              </button>
              <button
                className="report-from-details"
                type="button"
                onClick={() => {
                  onClose();
                  onReportIssue(shipment);
                }}
              >
                Report an issue
              </button>
              <button className="dialog-done" type="button" onClick={onClose}>
                Close details
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
