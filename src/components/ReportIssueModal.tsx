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

  useEffect(() => {
    if (preselectedShipment) {
      setShipmentId(preselectedShipment.id);
      setSubject(`Issue with ${preselectedShipment.item} (${preselectedShipment.trackingNumber})`);
      if (preselectedShipment.status.toLowerCase().includes('attempted')) {
        setCategory('missed_delivery');
      } else if (preselectedShipment.status.toLowerCase().includes('delayed')) {
        setCategory('delayed');
      }
    } else {
      setShipmentId('');
      setSubject('');
    }
  }, [preselectedShipment, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError('Please provide a subject and details of what happened.');
      return;
    }

    setLoading(true);
    setError(null);

    const relatedShipment = shipments.find((s) => s.id === shipmentId);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          shipmentId: shipmentId || undefined,
          shipmentLabel: relatedShipment ? `${relatedShipment.item} (${relatedShipment.trackingNumber})` : undefined,
          category,
          subject: subject.trim(),
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit issue report.');
      }

      onSuccess(data.ticket);
      onClose();
      // Reset
      setSubject('');
      setDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit ticket.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="report-issue-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Support Desk</p>
              <h2 id="report-issue-title">Report an issue or feedback</h2>
              <p className="dialog-sub">We will review your submission and investigate tracking status discrepancies.</p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
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
                  backgroundColor: 'rgba(229, 62, 62, 0.12)',
                  border: '1px solid #e53e3e',
                  color: '#fc8181',
                  fontSize: '11px',
                }}
              >
                {error}
              </div>
            )}

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
                <option value="delayed">Delayed shipment</option>
                <option value="missed_delivery">Missed delivery / Failed attempt</option>
                <option value="incorrect_status">Incorrect status on tracker</option>
                <option value="delivered_not_received">Marked delivered but not received</option>
                <option value="website_issue">Website or app bug</option>
                <option value="general_feedback">General feedback &amp; suggestion</option>
              </select>
            </div>

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
                    {s.item} ({s.store} · {s.trackingNumber})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label htmlFor="ticket-subject" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                Subject / Brief Summary *
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
                placeholder="Include what happened, the time of the scan or attempt, and any carrier notes..."
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
              <strong style={{ color: 'var(--ink)' }}>Note on Carrier vs Website Support:</strong> Submitting a ticket here logs it with the ParcelPath support desk to check tracking discrepancies. It does not automatically file a claim with Amazon, Flipkart, or the courier company.
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
        </div>
      </div>
    </>
  );
};
