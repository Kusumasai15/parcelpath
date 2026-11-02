import React, { useState } from 'react';
import { SupportTicket, UserProfile } from '../types';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  sessionToken: string | null;
  onSuccess: (ticket: SupportTicket) => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  sessionToken,
  onSuccess,
}) => {
  const [topic, setTopic] = useState('experience');
  const [subject, setSubject] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError('Please provide your thoughts or suggestions.');
      return;
    }

    setLoading(true);
    setError(null);

    const topicLabel =
      topic === 'tracking'
        ? 'Tracking Accuracy'
        : topic === 'features'
        ? 'Feature Suggestion'
        : topic === 'performance'
        ? 'Website Performance'
        : 'Overall Experience';

    const finalSubject = subject.trim() || `User Feedback: ${topicLabel} (${rating}★)`;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : { 'x-allow-demo': 'true' }),
        },
        body: JSON.stringify({
          contactName: currentUser?.name || 'ParcelPath User',
          contactEmail: currentUser?.email || '',
          preferredContactMethod: 'email',
          category: 'general_feedback',
          categoryLabel: 'Product Feedback',
          subject: finalSubject,
          description: `[Rating: ${rating}/5 stars | Topic: ${topicLabel}]\n\n${feedback.trim()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit feedback.');
      }

      onSuccess(data.ticket);
      onClose();
      setSubject('');
      setFeedback('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not submit feedback.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">ParcelPath Community</p>
              <h2 id="feedback-dialog-title">Send feedback</h2>
              <p className="dialog-sub">Tell us how we can make delivery tracking better for you.</p>
            </div>
            <button
              className="dialog-close"
              type="button"
              onClick={onClose}
              aria-label="Close feedback dialog"
            >
              ✕
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                margin: '14px 0 0',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(238, 83, 83, 0.15)',
                border: '1px solid #ee5353',
                color: '#fc8181',
                fontSize: '11px',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label
                  htmlFor="feedback-topic"
                  style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: 'var(--ink)', fontWeight: 500 }}
                >
                  Topic
                </label>
                <select
                  id="feedback-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                >
                  <option value="experience">Overall Experience</option>
                  <option value="tracking">Tracking Accuracy &amp; Couriers</option>
                  <option value="features">New Feature Request</option>
                  <option value="performance">Speed &amp; Mobile Usability</option>
                </select>
              </div>

              <div>
                <span style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: 'var(--ink)', fontWeight: 500 }}>
                  Experience rating
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      aria-label={`${star} star`}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: rating >= star ? '1px solid var(--coral)' : '1px solid var(--line)',
                        background: rating >= star ? 'color-mix(in srgb, var(--coral) 18%, var(--surface))' : 'var(--page)',
                        color: rating >= star ? 'var(--coral)' : 'var(--muted)',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      ★ {star}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="feedback-subject"
                  style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: 'var(--ink)', fontWeight: 500 }}
                >
                  Subject (Optional)
                </label>
                <input
                  id="feedback-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Love the calendar view, add SMS alerts"
                  style={{
                    width: '100%',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-details"
                  style={{ display: 'block', marginBottom: '6px', fontSize: '11px', color: 'var(--ink)', fontWeight: 500 }}
                >
                  Your thoughts or suggestions <span style={{ color: 'var(--coral)' }}>*</span>
                </label>
                <textarea
                  id="feedback-details"
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="What worked well? What could we improve?"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div className="dialog-actions" style={{ marginTop: '20px' }}>
              <button type="button" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                type="submit"
                className="report-from-details"
                disabled={loading}
                style={{
                  background: 'var(--coral)',
                  color: 'var(--coral-ink)',
                  borderColor: 'var(--coral)',
                  fontWeight: 600,
                }}
              >
                {loading ? 'Submitting...' : 'Submit feedback'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};
