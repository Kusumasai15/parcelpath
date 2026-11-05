import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle2 } from 'lucide-react';

interface EmailConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string | null;
  onRefreshShipments?: () => void;
}

export const EmailConnectModal: React.FC<EmailConnectModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
  onRefreshShipments,
}) => {
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'setup_required' | 'connected'>('disconnected');
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>();
  const [matchNotice, setMatchNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/integrations/email', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
      });
      const data = await res.json();
      setStatus(data.status || 'disconnected');
      setOauthConfigured(!!data.oauthConfigured);
      setConnectedEmail(data.email);
    } catch (e) {
      console.error('Error fetching email integration status:', e);
      setOauthConfigured(false);
    }
  };

  if (!isOpen) return null;

  // Initiate Google OAuth consent flow
  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google/url', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Email photo matching is unavailable. You can still track your parcels.');
      }
    } catch (err: unknown) {
      console.error('Connect error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect email
  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/integrations/email/disconnect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      setStatus('disconnected');
      setConnectedEmail(undefined);
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Trigger manual parcel matching scan
  const handleMatchPhotos = async () => {
    setMatching(true);
    setMatchNotice(null);
    try {
      const res = await fetch('/api/integrations/email/match', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setMatchNotice(`Scan complete! ${data.matchedCount || 0} product photos matched.`);
        if (onRefreshShipments) onRefreshShipments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMatching(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="email-connect-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Product Photo Matching</p>
              <h2 id="email-connect-title">Connect Gmail for Order Photos</h2>
              <p className="dialog-sub">Automatically match purchase emails with your courier tracking numbers.</p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            {/* If setup is incomplete, show ONLY this message as required */}
            {!oauthConfigured ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--surface)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: 'var(--muted)',
                  textAlign: 'center',
                }}
              >
                <p style={{ margin: 0, fontWeight: 500 }}>
                  Email photo matching is unavailable. You can still track your parcels.
                </p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'color-mix(in srgb, var(--surface-raised) 85%, var(--mauve))',
                    marginBottom: '16px',
                  }}
                >
                  <Mail size={22} style={{ color: 'var(--amber)' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: 'var(--ink)' }}>
                      {status === 'connected' ? `Connected: ${connectedEmail || 'Gmail'}` : 'Gmail Connection Status'}
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {status === 'connected'
                        ? 'Active · Scanning order emails for product thumbnails'
                        : 'Disconnected · Using package icon fallback (📦)'}
                    </span>
                  </div>
                </div>

                {matchNotice && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'color-mix(in srgb, #38a169 15%, var(--page))',
                      color: '#38a169',
                      fontSize: '12px',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{matchNotice}</span>
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--ink)' }}>
                    How Gmail Photo Matching Works:
                  </p>
                  <ul style={{ paddingLeft: '18px', margin: 0 }}>
                    <li>Click Connect Gmail to open Google consent.</li>
                    <li>We request narrow read-only access (<code>gmail.readonly</code>) to find order confirmation emails.</li>
                    <li>Matched product pictures are shown in your parcel thumbnail slot, with the parcel icon (📦) as fallback.</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="dialog-actions" style={{ marginTop: '20px' }}>
              <button type="button" onClick={onClose}>
                Close
              </button>
              {oauthConfigured && (
                <>
                  {status === 'connected' ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleMatchPhotos}
                        disabled={matching}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RefreshCw size={13} className={matching ? 'animate-spin' : ''} />
                        {matching ? 'Matching...' : 'Match Photos Now'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={loading}
                        style={{ color: '#fc8181', borderColor: 'rgba(229, 62, 62, 0.4)' }}
                      >
                        {loading ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="primary"
                      type="button"
                      onClick={handleConnect}
                      disabled={loading}
                    >
                      {loading ? 'Connecting...' : 'Connect Gmail'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
