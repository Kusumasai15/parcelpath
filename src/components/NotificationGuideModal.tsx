import React, { useState } from 'react';

interface NotificationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  browserStatus: string;
  onSendTestAlert: () => void;
  onRequestPermission: () => Promise<void>;
}

export const NotificationGuideModal: React.FC<NotificationGuideModalProps> = ({
  isOpen,
  onClose,
  browserStatus,
  onSendTestAlert,
  onRequestPermission,
}) => {
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [requesting, setRequesting] = useState(false);

  if (!isOpen) return null;

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleTestClick = async () => {
    setTesting(true);
    try {
      await onSendTestAlert();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3500);
    } finally {
      setTesting(false);
    }
  };

  const handleRequestClick = async () => {
    setRequesting(true);
    try {
      await onRequestPermission();
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenStandalone = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="custom-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-guide-title"
        style={{ maxWidth: '580px' }}
      >
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Delivery Alerts &amp; Permissions</p>
              <h2 id="notif-guide-title">Alerts &amp; Browser Notifications</h2>
              <p className="dialog-sub">
                How ParcelPath delivers your parcel updates and how to manage notifications.
              </p>
            </div>
            <button
              className="dialog-close"
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>

          <div style={{ display: 'grid', gap: '14px', marginTop: '14px' }}>
            {/* Status Comparison Overview */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {/* In-App Alerts Status */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'color-mix(in srgb, var(--surface) 92%, var(--mauve))',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>In-App Delivery Alerts</strong>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '99px',
                      backgroundColor: 'rgba(72, 187, 120, 0.2)',
                      color: '#48bb78',
                    }}
                  >
                    ✓ Always Active
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.45' }}>
                  All parcel status changes (Out for delivery, Attempted, Delayed, Delivered) appear in your 🔔 alert center and on delivery cards automatically.
                </p>
              </div>

              {/* Browser Desktop Push Status */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'color-mix(in srgb, var(--surface) 92%, var(--mauve))',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--ink)' }}>Browser Desktop Push</strong>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '99px',
                      backgroundColor:
                        browserStatus === 'granted'
                          ? 'rgba(72, 187, 120, 0.2)'
                          : browserStatus === 'denied'
                          ? 'rgba(245, 101, 101, 0.2)'
                          : 'rgba(160, 174, 192, 0.2)',
                      color:
                        browserStatus === 'granted'
                          ? '#48bb78'
                          : browserStatus === 'denied'
                          ? '#f56565'
                          : 'var(--muted)',
                    }}
                  >
                    {browserStatus === 'granted'
                      ? '✓ Enabled'
                      : browserStatus === 'denied'
                      ? '⚠️ Blocked'
                      : '⚪ Not Enabled'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: '1.45' }}>
                  {browserStatus === 'granted'
                    ? 'Native OS system banners will appear when courier tracking events trigger.'
                    : 'System push notifications outside this window require browser permission.'}
                </p>
              </div>
            </div>

            {/* Why is it blocked explanation */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--surface-raised)',
                fontSize: '11px',
                lineHeight: '1.5',
              }}
            >
              <h3 style={{ fontSize: '12px', margin: '0 0 6px', color: 'var(--ink)' }}>
                Why does it say &ldquo;Blocked&rdquo; and why was &ldquo;Enable&rdquo; unresponsive?
              </h3>
              <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>
                Web browsers have strict security and anti-spam standards for system notifications:
              </p>
              <ul style={{ margin: '0 0 10px', paddingLeft: '18px', color: 'var(--ink)', display: 'grid', gap: '6px' }}>
                {isInIframe && (
                  <li>
                    <strong>Preview Iframe Sandbox:</strong> You are currently viewing ParcelPath inside an embedded iframe preview (like Google AI Studio). Modern web browsers completely disallow embedded iframes from prompting or displaying OS-level notifications for user privacy.
                  </li>
                )}
                <li>
                  <strong>Silent Rejection When Blocked:</strong> Once a browser permission is in the &ldquo;Blocked&rdquo; or &ldquo;Denied&rdquo; state (or blocked by default browser policy), the W3C Web Notification specification <em>forbids</em> websites from showing the permission popup again. Clicking &ldquo;Enable&rdquo; returns &ldquo;denied&rdquo; silently without showing any dialog.
                </li>
                <li>
                  <strong>In-App Alerts Are NEVER Blocked:</strong> Your ParcelPath in-app delivery alerts, courier scans, and unread counts continue to work 100% seamlessly right inside this dashboard.
                </li>
              </ul>
            </div>

            {/* Step-by-Step Instructions to Unblock */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                borderLeft: '3px solid var(--coral)',
                background: 'color-mix(in srgb, var(--surface) 92%, var(--mauve))',
                fontSize: '11px',
              }}
            >
              <h3 style={{ fontSize: '12px', margin: '0 0 8px', color: 'var(--ink)' }}>
                How to Unblock or Enable Desktop Notifications:
              </h3>
              <div style={{ display: 'grid', gap: '8px', color: 'var(--ink)' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-text)', minWidth: '16px' }}>1.</span>
                  <span>
                    <strong>Click the Site Controls / Padlock icon 🔒</strong> located on the far left of your browser address bar at the top.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-text)', minWidth: '16px' }}>2.</span>
                  <span>
                    Look for <strong>&ldquo;Notifications&rdquo;</strong> (or click <strong>Site settings → Notifications</strong>).
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-text)', minWidth: '16px' }}>3.</span>
                  <span>
                    Switch the setting from <strong>Block</strong> to <strong>Allow</strong> (or Reset permission to &ldquo;Ask&rdquo;).
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-text)', minWidth: '16px' }}>4.</span>
                  <span>
                    <strong>Reload the webpage</strong>. The browser will then recognize your permission.
                  </span>
                </div>
              </div>
            </div>

            {/* Test alert confirmation */}
            {testSent && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(72, 187, 120, 0.15)',
                  color: '#48bb78',
                  fontSize: '11px',
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                ✓ Test delivery alert created! Check your 🔔 Delivery Alerts panel above.
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'flex-end',
                marginTop: '10px',
                paddingTop: '12px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <button
                type="button"
                onClick={handleTestClick}
                disabled={testing}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {testing ? 'Sending...' : '⚡ Send Test In-App Alert'}
              </button>

              {isInIframe && (
                <button
                  type="button"
                  onClick={handleOpenStandalone}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  title="Open app in a top-level tab to test native OS notifications"
                >
                  Open in Standalone Tab ↗
                </button>
              )}

              {browserStatus !== 'granted' && !isInIframe && (
                <button
                  type="button"
                  onClick={handleRequestClick}
                  disabled={requesting}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--coral)',
                    color: 'var(--coral-ink)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {requesting ? 'Prompting...' : 'Request Permission'}
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-raised)',
                  color: 'var(--ink)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
