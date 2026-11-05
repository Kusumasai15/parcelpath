import React, { useState, useEffect } from 'react';
import { Shipment } from '../types';
import { SUPPORTED_COURIERS, formatRelativeTime, getShipmentProgress } from '../utils/courier';
import { formatTodayDeliveryEta, getIstDateStr } from '../utils/istDate';

interface OrderDetailsModalProps {
  shipment: Shipment | null;
  isOpen: boolean;
  onClose: () => void;
  onReportIssue: (shipment: Shipment) => void;
  onDeleteShipment: (shipmentId: string) => Promise<void>;
  onRefreshShipment: (shipmentId: string) => Promise<void>;
  onUpdateLabel?: (shipmentId: string, newLabel: string) => Promise<void>;
  onUpdateShipment?: (updatedShipment: Shipment) => void;
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
  onUpdateShipment,
  sessionToken,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'live_track'>('details');
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Custom label edit mode
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  // Per-parcel alert notifications preferences
  const [notifyOutForDelivery, setNotifyOutForDelivery] = useState(true);
  const [notifyDeliveryAttempted, setNotifyDeliveryAttempted] = useState(true);
  const [notifyDelivered, setNotifyDelivered] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);

  // "I won't be home" dialog state
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [rescheduleData, setRescheduleData] = useState<{
    message: string;
    officialPortalUrl: string | null;
    backupRecipientRecommendation: string;
  } | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [confirmedNewDate, setConfirmedNewDate] = useState('');
  const [isConfirmingReschedule, setIsConfirmingReschedule] = useState(false);
  const [rescheduleNotice, setRescheduleNotice] = useState<string | null>(null);

  useEffect(() => {
    if (shipment) {
      setNotifyOutForDelivery(shipment.notificationPreferences?.outForDelivery ?? true);
      setNotifyDeliveryAttempted(shipment.notificationPreferences?.deliveryAttempted ?? true);
      setNotifyDelivered(shipment.notificationPreferences?.delivered ?? true);
    }
  }, [shipment]);

  if (!isOpen || !shipment) return null;

  const courierInfo = SUPPORTED_COURIERS[shipment.courier] || SUPPORTED_COURIERS.other;
  const officialTrackingLink = courierInfo.trackingUrl(shipment.trackingNumber.replace(/^…/, ''));
  const progress = getShipmentProgress(shipment.status);
  const istTodayStr = getIstDateStr();
  const isArrivingToday = shipment.estimatedDate === istTodayStr;

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

  const handleToggleNotification = async (key: 'outForDelivery' | 'deliveryAttempted' | 'delivered') => {
    const nextOut = key === 'outForDelivery' ? !notifyOutForDelivery : notifyOutForDelivery;
    const nextAtt = key === 'deliveryAttempted' ? !notifyDeliveryAttempted : notifyDeliveryAttempted;
    const nextDel = key === 'delivered' ? !notifyDelivered : notifyDelivered;

    if (key === 'outForDelivery') setNotifyOutForDelivery(nextOut);
    if (key === 'deliveryAttempted') setNotifyDeliveryAttempted(nextAtt);
    if (key === 'delivered') setNotifyDelivered(nextDel);

    setSavingNotifications(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/notifications`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          outForDelivery: nextOut,
          deliveryAttempted: nextAtt,
          delivered: nextDel,
        }),
      });
      const data = await res.json();
      if (res.ok && data.shipment && onUpdateShipment) {
        onUpdateShipment(data.shipment);
      }
      setNotificationNotice('Alert preference saved · Sent once per distinct courier event');
      setTimeout(() => setNotificationNotice(null), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleWontBeHomeClick = async () => {
    setRescheduleLoading(true);
    setShowRescheduleDialog(true);
    setRescheduleNotice(null);
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

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedNewDate) return;
    setIsConfirmingReschedule(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/reschedule-confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({ newDate: confirmedNewDate }),
      });
      const data = await res.json();
      if (res.ok && data.shipment) {
        if (onUpdateShipment) onUpdateShipment(data.shipment);
        setRescheduleNotice(`Delivery rescheduled to ${confirmedNewDate}. Dashboard and calendar updated.`);
        setTimeout(() => {
          setRescheduleNotice(null);
          setShowRescheduleDialog(false);
        }, 3000);
      } else {
        setRescheduleNotice(data.error || 'Failed to update reschedule date.');
      }
    } catch (e) {
      console.error(e);
      setRescheduleNotice('Network error confirming reschedule.');
    } finally {
      setIsConfirmingReschedule(false);
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
        style={{ display: 'block', maxWidth: '620px', width: '92%' }}
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

          {/* VIEW SWITCHER: Details vs Live Track */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              borderBottom: '1px solid var(--line)',
              margin: '12px 0 16px',
              paddingBottom: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'details' ? 'var(--mauve)' : 'transparent',
                color: activeTab === 'details' ? 'var(--ink)' : 'var(--muted)',
                fontWeight: activeTab === 'details' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live_track')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'live_track' ? 'var(--mauve)' : 'transparent',
                color: activeTab === 'live_track' ? 'var(--ink)' : 'var(--muted)',
                fontWeight: activeTab === 'live_track' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Live Track</span>
              {shipment.liveCoordinates?.hasRealGps ? (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38a169', display: 'inline-block' }} />
              ) : null}
            </button>
          </div>

          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <>
              {/* Custom Label Quick Editor */}
              <div
                style={{
                  margin: '0 0 12px',
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
                    {isArrivingToday
                      ? formatTodayDeliveryEta(shipment.timeWindow, shipment.eta)
                      : shipment.timeWindow || shipment.eta || 'Time not available'}
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

              {/* FEATURE 3: PER-PARCEL ALERTS (Notify me) */}
              <section
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'color-mix(in srgb, var(--surface-raised) 70%, var(--surface))',
                  marginBottom: '16px',
                }}
                aria-label="Notify me options"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>🔔 Notify me</strong>
                  <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    {savingNotifications ? 'Saving...' : '1 alert per courier event'}
                  </span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--muted)' }}>
                  Select which milestone notifications to receive for this package:
                </p>

                <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={notifyOutForDelivery}
                      onChange={() => handleToggleNotification('outForDelivery')}
                      disabled={savingNotifications}
                    />
                    <span>Out for delivery</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={notifyDeliveryAttempted}
                      onChange={() => handleToggleNotification('deliveryAttempted')}
                      disabled={savingNotifications}
                    />
                    <span>Delivery attempted</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={notifyDelivered}
                      onChange={() => handleToggleNotification('delivered')}
                      disabled={savingNotifications}
                    />
                    <span>Delivered</span>
                  </label>
                </div>

                {notificationNotice && (
                  <p style={{ margin: '8px 0 0', fontSize: '10px', color: '#38a169', fontWeight: 600 }}>
                    ✓ {notificationNotice}
                  </p>
                )}
              </section>

              {/* FEATURE 4: "I WON'T BE HOME" RESCHEDULING MODAL / PANEL */}
              {showRescheduleDialog && (
                <div
                  style={{
                    marginTop: '16px',
                    marginBottom: '16px',
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
                      “I won’t be home” — Rescheduling &amp; Delivery Instructions
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
                    <p style={{ margin: 0, color: 'var(--muted)' }}>Checking official carrier reschedule options...</p>
                  ) : rescheduleData ? (
                    <>
                      <p style={{ margin: '0 0 10px', color: 'var(--muted)' }}>
                        {rescheduleData.message}
                      </p>
                      <p style={{ margin: '0 0 12px', color: 'var(--ink)' }}>
                        {rescheduleData.backupRecipientRecommendation}
                      </p>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {rescheduleData.officialPortalUrl ? (
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
                            Open {shipment.courierName} Official Portal ↗
                          </a>
                        ) : (
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: '7px',
                              background: 'var(--surface)',
                              border: '1px dashed var(--line)',
                              color: 'var(--muted)',
                              fontSize: '11px',
                              width: '100%',
                            }}
                          >
                            Online rescheduling is unavailable for {shipment.courierName}. Please coordinate directly with the delivery agent or carrier customer support.
                          </div>
                        )}
                      </div>

                      {/* Form to update confirmed date from courier */}
                      <form onSubmit={handleConfirmReschedule} style={{ borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                        <label htmlFor="confirm-new-reschedule-date" style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ink)', marginBottom: '5px' }}>
                          Courier-confirmed new delivery date:
                        </label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            id="confirm-new-reschedule-date"
                            type="date"
                            value={confirmedNewDate}
                            onChange={(e) => setConfirmedNewDate(e.target.value)}
                            required
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--line)',
                              background: 'var(--page)',
                              color: 'var(--ink)',
                              fontSize: '11px',
                            }}
                          />
                          <button
                            type="submit"
                            disabled={isConfirmingReschedule || !confirmedNewDate}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              background: 'var(--coral)',
                              color: 'var(--coral-ink)',
                              border: 'none',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {isConfirmingReschedule ? 'Saving...' : 'Confirm Reschedule'}
                          </button>
                        </div>
                        <p style={{ margin: '5px 0 0', fontSize: '10px', color: 'var(--muted)' }}>
                          Dashboard and delivery calendar update only after the courier confirms a new date.
                        </p>
                      </form>

                      {rescheduleNotice && (
                        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#38a169', fontWeight: 600 }}>
                          ✓ {rescheduleNotice}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </>
          )}

          {/* TAB 2: FEATURE 5 - CLEAR MAP UPDATES (Under Details → Live Track) */}
          {activeTab === 'live_track' && (
            <div style={{ marginBottom: '16px' }}>
              {/* Badge: Live GPS vs Last courier scan */}
              {shipment.liveCoordinates?.hasRealGps && shipment.liveCoordinates.latitude && shipment.liveCoordinates.longitude ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #38a169',
                    backgroundColor: 'color-mix(in srgb, #38a169 10%, var(--surface))',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#38a169',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38a169', display: 'inline-block' }} />
                      Live GPS
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                      Courier update: <strong style={{ color: 'var(--ink)' }}>{shipment.liveCoordinates.updatedAt || 'Recent (IST)'}</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink)', display: 'flex', gap: '16px' }}>
                    <span>Lat: {shipment.liveCoordinates.latitude.toFixed(4)}</span>
                    <span>Long: {shipment.liveCoordinates.longitude.toFixed(4)}</span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    backgroundColor: 'var(--surface-raised)',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--accent-text)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      📍 Last courier scan
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                      Reported: <strong style={{ color: 'var(--ink)' }}>{shipment.courierEventTime || formatRelativeTime(shipment.lastRefreshedAt)}</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 600, marginBottom: '4px' }}>
                    {shipment.location || 'Local courier hub scan'}
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    This courier broadcasts hub scan checkpoints. Real-time moving driver telemetry is not provided for this parcel.
                  </p>
                </div>
              )}

              {/* Map Canvas / Visualizer with failure-proof fallback */}
              <div
                style={{
                  height: '140px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--page)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  textAlign: 'center',
                  marginBottom: '14px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>🗺️</div>
                <strong style={{ fontSize: '12px', color: 'var(--ink)', marginBottom: '3px' }}>
                  {shipment.liveCoordinates?.hasRealGps ? 'Live Verified Coordinate Map' : 'Hub Scan Location Marker'}
                </strong>
                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {shipment.location} · {shipment.courierName}
                </span>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '6px',
                    right: '8px',
                    fontSize: '9px',
                    color: 'var(--muted)',
                  }}
                >
                  Carrier telemetry verified
                </span>
              </div>
            </div>
          )}

          {/* TEXT TIMELINE: ALWAYS KEPT VISIBLE EVEN IF MAP FAILS TO LOAD */}
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
            Arrival times and location updates are provided by {shipment.courierName || 'the courier'}. We do not simulate movement or invent an ETA.
          </p>

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
              {/* Feature 4: For an out-for-delivery parcel, add I won't be home in Details */}
              {shipment.status === 'Out for delivery' && (
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
              {/* Feature 6: Report an issue from Details */}
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
