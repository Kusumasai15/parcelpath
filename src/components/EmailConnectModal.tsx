import React, { useState, useEffect } from 'react';

interface EmailConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string | null;
}

export const EmailConnectModal: React.FC<EmailConnectModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'setup_required' | 'connected'>('disconnected');
  const [message, setMessage] = useState('');
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [setupGuide, setSetupGuide] = useState<string | undefined>();
  const [connectedEmail, setConnectedEmail] = useState<string | undefined>();

  useEffect(() => {
    if (!isOpen) return;
    fetchStatus();
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/integrations/email', {
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      const data = await res.json();
      setStatus(data.status);
      setMessage(data.message || '');
      setOauthConfigured(data.oauthConfigured);
      setSetupGuide(data.setupGuide);
      setConnectedEmail(data.email);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/email/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('setup_required');
        setSetupGuide(data.instructions);
        setMessage(data.error);
      } else {
        setStatus('connected');
        fetchStatus();
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/integrations/email/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
      });
      setStatus('disconnected');
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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
              <h2 id="email-connect-title">Connect Email for Order Photos</h2>
              <p className="dialog-sub">Automatically match purchase emails with tracking IDs.</p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
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
              <span style={{ fontSize: '24px' }}>📧</span>
              <div>
                <strong style={{ display: 'block', fontSize: '12px', color: 'var(--ink)' }}>
                  {status === 'connected' ? `Connected: ${connectedEmail || 'Gmail'}` : 'Gmail Connection Status'}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  {status === 'connected'
                    ? 'Active · Scanning order dispatch emails for verified thumbnails'
                    : 'Disconnected · Using neutral package placeholder 📦'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>Truthful Image Matching Priority:</strong>
              </p>
              <ol style={{ paddingLeft: '18px', margin: 0 }}>
                <li>Verified product image from retailer/provider integration.</li>
                <li>Matching order/dispatch email that you authorize us to inspect.</li>
                <li>Manual product image URL entered in parcel settings.</li>
                <li>Neutral package placeholder (📦) when no verified image is available.</li>
              </ol>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                borderLeft: '2px solid var(--accent-text)',
                backgroundColor: 'color-mix(in srgb, var(--mauve) 25%, transparent)',
                fontSize: '11px',
                color: 'var(--muted)',
                lineHeight: '1.45',
                marginBottom: '16px',
              }}
            >
              <strong style={{ color: 'var(--ink)' }}>Privacy &amp; Security:</strong> We never request your email password. If enabled, we use narrow, read-only OAuth permission (<code>gmail.readonly</code>) to filter exclusively for order receipts matching your courier tracking AWB. Full email bodies are not stored.
            </div>

            {!oauthConfigured && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--page)',
                  fontSize: '11px',
                  lineHeight: '1.45',
                  marginBottom: '16px',
                }}
              >
                <strong style={{ color: 'var(--coral)', display: 'block', marginBottom: '4px' }}>
                  OAuth Configuration Required
                </strong>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  {setupGuide || 'To enable real Gmail scanning, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env. Basic tracking works without email connection.'}
                </p>
              </div>
            )}

            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
              {status === 'connected' ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={loading}
                  style={{ color: '#fc8181', borderColor: 'rgba(229, 62, 62, 0.4)' }}
                >
                  {loading ? 'Disconnecting...' : 'Disconnect email'}
                </button>
              ) : (
                <button
                  className="report-from-details"
                  type="button"
                  onClick={handleConnect}
                  disabled={loading}
                >
                  {loading ? 'Checking OAuth...' : oauthConfigured ? 'Authorize with Google' : 'Check OAuth setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
