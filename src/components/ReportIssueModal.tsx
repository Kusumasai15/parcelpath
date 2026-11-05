import React, { useState, useEffect } from 'react';
import { Shipment, SupportTicket } from '../types';

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipments: Shipment[];
  preselectedShipment?: Shipment | null;
  onSuccess: (ticket: SupportTicket) => void;
  sessionToken: string | null;
}

export const ReportIssueModal: React.FC<ReportIssueModalProps> = ({
  isOpen,
  onClose,
  shipments,
  preselectedShipment,
  onSuccess,
  sessionToken,
}) => {
  const [category, setCategory] = useState<SupportTicket['category']>('delayed');
  const [shipmentId, setShipmentId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    if (preselectedShipment) {
      setShipmentId(preselectedShipment.id);
      setSubject(`Issue with ${preselectedShipment.item} (${preselectedShipment.trackingNumber})`);
      if (preselectedShipment.status === 'Delivered') {
        setCategory('delivered_not_received');
      } else if (preselectedShipment.status.toLowerCase().includes('attempted')) {
        setCategory('missed_delivery');
      } else if (preselectedShipment.status.toLowerCase().includes('delayed')) {
        setCategory('delayed');
      }
    } else {
      setShipmentId('');
      setSubject('');
    }
    setError(null);
    setCreatedTicket(null);
  }, [preselectedShipment, isOpen]);

  if (!isOpen) return null;

  const currentShipment = preselectedShipment || shipments.find((s) => s.id === shipmentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError('Please provide a subject and details of what happened.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          shipmentId: currentShipment?.id || shipmentId || undefined,
          shipmentLabel: currentShipment ? `${currentShipment.item} (${currentShipment.trackingNumber})` : undefined,
          trackingNumber: currentShipment?.trackingNumber,
          courier: currentShipment?.courierName || currentShipment?.courier,
          category,
          subject: subject.trim(),
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit issue report.');
      }

      setCreatedTicket(data.ticket);
      onSuccess(data.ticket);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit ticket.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    onClose();
    setCreatedTicket(null);
    setSubject('');
    setDescription('');
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="report-issue-title" style={{ maxWidth: '580px', width: '92%' }}>
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Support Desk</p>
              <h2 id="report-issue-title">Report an issue</h2>
              <p className="dialog-sub">Submit an inquiry or tracking discrepancy to our support desk.</p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          {createdTicket ? (
            /* Success confirmation with reference number */
            <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid #38a169' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38a169', fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                ✓ Ticket Submitted Successfully
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--ink)' }}>
                Your request has been logged and assigned reference number:
              </p>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--page)',
                  border: '1px dashed var(--line)',
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--coral)',
                  marginBottom: '14px',
                  textAlign: 'center',
                }}
              >
                {createdTicket.ticketRef || createdTicket.id}
              </div>
              <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.45 }}>
                You can track updates to this inquiry anytime under <strong>Issues &amp; Feedback</strong> in your sidebar.
              </p>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="report-from-details"
                  onClick={handleFinish}
                >
                  View in Issues &amp; Feedback →
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
              {error && (
                <div
                  style={{
                    padding: '10px 12px',
                    marginBottom: '14px',
                    borderRadius: '9px',
                    backgroundColor: 'rgba(229, 62, 62, 0.12)',
                    border: '1px solid #e53e3e',
                    color: '#fc8181',
                    fontSize: '11px',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Prefilled Parcel Info Banner */}
              {currentShipment ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    marginBottom: '14px',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: 'var(--muted)', display: 'block', marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Prefilled Parcel Details:
                  </span>
                  <strong style={{ color: 'var(--ink)' }}>{currentShipment.item}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: '10px', marginTop: '2px' }}>
                    Courier: {currentShipment.courierName} · Tracking: {currentShipment.trackingNumber}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="ticket-shipment" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                    Related Shipment (Optional)
                  </label>
                  <select
                    id="ticket-shipment"
                    value={shipmentId}
                    onChange={(e) => setShipmentId(e.target.value)}
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
                    <option value="">-- No specific parcel --</option>
                    {shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.item} ({s.store} · {s.courierName} · {s.trackingNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Issue Category Dropdown with "Delivered but not received" */}
              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="ticket-category" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Issue Category *
                </label>
                <select
                  id="ticket-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
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
                  <option value="delivered_not_received">Delivered but not received</option>
                  <option value="delayed">Delayed shipment</option>
                  <option value="missed_delivery">Missed delivery / Delivery attempted</option>
                  <option value="incorrect_status">Incorrect status on tracker</option>
                  <option value="website_issue">Website or app bug</option>
                  <option value="general_feedback">General feedback &amp; suggestion</option>
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="ticket-subject" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Subject / Summary *
                </label>
                <input
                  id="ticket-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Courier marked delivery attempted but did not call"
                  required
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

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="ticket-desc" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Detailed Explanation *
                </label>
                <textarea
                  id="ticket-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Include what happened, the scan timestamp, and any relevant details..."
                  required
                  style={{
                    width: '100%',
                    padding: '10px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '16px',
                  borderRadius: '8px',
                  borderLeft: '2px solid var(--accent-text)',
                  backgroundColor: 'color-mix(in srgb, var(--mauve) 25%, transparent)',
                  fontSize: '10px',
                  color: 'var(--muted)',
                  lineHeight: '1.45',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>Note:</strong> Submitting logs a ticket in your ParcelPath account with an assigned reference number.
              </div>

              <div className="dialog-actions">
                <button type="button" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button className="report-from-details" type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit ticket'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
