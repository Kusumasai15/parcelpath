import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

interface ResetPasswordModalProps {
  isOpen: boolean;
  token: string | null;
  onClose: () => void;
  onSuccess: (email: string) => void;
  onRequestNewLink: () => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  token,
  onClose,
  onSuccess,
  onRequestNewLink,
}) => {
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !token) {
      setVerifying(false);
      setTokenValid(false);
      return;
    }

    let isMounted = true;
    setVerifying(true);
    setTokenError(null);

    fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.valid) {
          setTokenValid(true);
          setEmail(data.email || '');
        } else {
          setTokenValid(false);
          setTokenError(data.reason || 'This password reset link is invalid, expired, or has already been used.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setTokenValid(false);
        setTokenError('Failed to verify password reset link. Please check your connection.');
        console.error('Token verification error:', err);
      })
      .finally(() => {
        if (isMounted) setVerifying(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.');
      }

      // Password reset succeeded!
      setNewPassword('');
      setConfirmPassword('');
      onSuccess(email);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Account Security</p>
              <h2 id="reset-modal-title">Reset Password</h2>
              <p className="dialog-sub">
                {email ? `Setting a new password for ${email}` : 'Choose a secure new password for your account.'}
              </p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          {verifying ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '2px solid var(--amber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '12px' }} />
              <p style={{ fontSize: '13px' }}>Verifying secure reset token...</p>
            </div>
          ) : !tokenValid ? (
            <div style={{ padding: '16px 0' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                  border: '1px solid color-mix(in srgb, #e53e3e 30%, var(--line))',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle size={20} style={{ color: '#e53e3e', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Invalid or Expired Link
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--muted)' }}>
                    {tokenError || 'This password reset link is invalid, has expired, or has already been used.'}
                  </p>
                </div>
              </div>

              <div className="dialog-actions">
                <button type="button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="report-from-details"
                  onClick={onRequestNewLink}
                >
                  Request New Reset Link
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
              {error && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                    border: '1px solid color-mix(in srgb, #e53e3e 30%, var(--line))',
                    color: '#e53e3e',
                    fontSize: '12px',
                    marginBottom: '14px',
                  }}
                >
                  {error}
                </div>
              )}

              {/* NEW PASSWORD FIELD */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="reset-new-password"
                  style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
                >
                  New Password <span style={{ color: 'var(--amber)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 11px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                  Minimum 8 characters. Do not reuse old passwords.
                </p>
              </div>

              {/* CONFIRM PASSWORD FIELD */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="reset-confirm-password"
                  style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
                >
                  Confirm Password <span style={{ color: 'var(--amber)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={8}
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 11px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#e53e3e' }}>
                    Passwords do not match.
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#38a169', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Passwords match
                  </p>
                )}
              </div>

              <div className="dialog-actions">
                <button type="button" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="report-from-details"
                  disabled={submitting || newPassword.length < 8 || newPassword !== confirmPassword}
                >
                  {submitting ? 'Resetting Password...' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
