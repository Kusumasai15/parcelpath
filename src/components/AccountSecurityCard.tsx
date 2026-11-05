import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, KeyRound, Trash2, Shield, Copy, Check } from 'lucide-react';
import { UserProfile } from '../types';

interface AccountSecurityCardProps {
  sessionToken: string | null;
  currentUser: UserProfile | null;
  onAccountDeleted: () => void;
  onNotice: (msg: string) => void;
  onOpenAuth?: (view?: 'login' | 'register' | 'forgot_password') => void;
  onRequireReauth?: () => void;
}

export const AccountSecurityCard: React.FC<AccountSecurityCardProps> = ({
  sessionToken,
  currentUser,
  onAccountDeleted,
  onNotice,
}) => {
  // If user is signed out, hide both account actions and the sign-in prompts completely
  if (!currentUser || !sessionToken) {
    return null;
  }

  // Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Recovery Code State
  const [replacementCode, setReplacementCode] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Delete Account State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Submit Password Change (Active session, no re-prompting)
  const handleSubmitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match. Please re-enter.');
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setPasswordSuccess('Password successfully updated! All other active sessions have been invalidated.');
      onNotice('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsChangingPassword(false);
        setPasswordSuccess(null);
      }, 3000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Generate Replacement Recovery Code
  const handleGenerateReplacementCode = async () => {
    setRecoveryLoading(true);
    setRecoveryError(null);
    setReplacementCode(null);
    setRecoveryCopied(false);

    try {
      const res = await fetch('/api/auth/recovery-code/regenerate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate recovery code.');
      }

      setReplacementCode(data.recoveryCode);
      onNotice('New recovery code generated. Store it safely.');
    } catch (err: unknown) {
      setRecoveryError(err instanceof Error ? err.message : 'Failed to generate replacement code.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleCopyRecoveryCode = () => {
    if (!replacementCode) return;
    navigator.clipboard.writeText(replacementCode);
    setRecoveryCopied(true);
    setTimeout(() => setRecoveryCopied(false), 2500);
  };

  // Delete Account Confirmation
  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account.');
      }

      // Show success ONLY after deletion completes
      setIsDeleteModalOpen(false);
      onNotice('Your account and all your data have been permanently deleted.');
      onAccountDeleted();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <article className="settings-card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Lock size={18} style={{ color: 'var(--amber)' }} />
          <h2 style={{ margin: 0 }}>Password &amp; Security</h2>
        </div>
        <p className="support-copy" style={{ marginBottom: '16px' }}>
          Update your login password and manage account security. Only a new password and confirmation are required.
        </p>

        {passwordSuccess && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'color-mix(in srgb, #38a169 15%, var(--page))',
              border: '1px solid color-mix(in srgb, #38a169 35%, var(--line))',
              color: '#38a169',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{passwordSuccess}</span>
          </div>
        )}

        {!isChangingPassword ? (
          <div className="simple-actions" style={{ marginBottom: '20px' }}>
            <button
              className="primary"
              type="button"
              onClick={() => {
                setIsChangingPassword(true);
                setPasswordError(null);
                setPasswordSuccess(null);
                setNewPassword('');
                setConfirmPassword('');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <KeyRound size={15} /> Change password
            </button>
          </div>
        ) : (
          /* Simplified Two-Field Password Form */
          <form onSubmit={handleSubmitPasswordChange} style={{ maxWidth: '420px', marginBottom: '24px' }}>
            {passwordError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                  border: '1px solid color-mix(in srgb, #e53e3e 30%, var(--line))',
                  color: '#e53e3e',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                {passwordError}
              </div>
            )}

            {/* NEW PASSWORD */}
            <div style={{ marginBottom: '14px' }}>
              <label
                htmlFor="account-new-password"
                style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
              >
                New password <span style={{ color: 'var(--amber)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="account-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 10px',
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
            </div>

            {/* CONFIRM PASSWORD */}
            <div style={{ marginBottom: '18px' }}>
              <label
                htmlFor="account-confirm-password"
                style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
              >
                Confirm password <span style={{ color: 'var(--amber)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="account-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 10px',
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
            </div>

            <div className="simple-actions" style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsChangingPassword(false);
                  setPasswordError(null);
                }}
                disabled={passwordLoading}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                className="primary"
                type="submit"
                disabled={passwordLoading || newPassword.length < 8 || newPassword !== confirmPassword}
              >
                {passwordLoading ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </form>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '20px 0' }} />

        {/* RECOVERY CODE MANAGEMENT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Shield size={18} style={{ color: 'var(--amber)' }} />
          <h2 style={{ margin: 0 }}>Account Recovery Code</h2>
        </div>
        <p className="support-copy" style={{ marginBottom: '14px' }}>
          Your recovery code is stored only as a cryptographic hash in Neon. It allows you to reset your password if you ever lose access.
        </p>

        {recoveryError && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
              color: '#e53e3e',
              fontSize: '12px',
              marginBottom: '12px',
            }}
          >
            {recoveryError}
          </div>
        )}

        {replacementCode && (
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
              marginBottom: '14px',
            }}
          >
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your New Replacement Recovery Code
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <code
                style={{
                  fontFamily: 'monospace',
                  fontSize: '18px',
                  letterSpacing: '2px',
                  fontWeight: 700,
                  color: 'var(--amber)',
                  background: 'var(--page)',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  userSelect: 'all',
                }}
              >
                {replacementCode}
              </code>
              <button
                type="button"
                onClick={handleCopyRecoveryCode}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-raised)',
                  color: 'var(--ink)',
                  fontSize: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                {recoveryCopied ? <Check size={14} style={{ color: '#38a169' }} /> : <Copy size={14} />}
                {recoveryCopied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#fc8181' }}>
              ⚠️ Store this code safely. Your previous recovery code was permanently invalidated.
            </p>
          </div>
        )}

        <div className="simple-actions" style={{ marginBottom: '24px' }}>
          <button
            type="button"
            onClick={handleGenerateReplacementCode}
            disabled={recoveryLoading}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
            }}
          >
            <Shield size={14} />
            {recoveryLoading ? 'Generating...' : 'Generate replacement recovery code'}
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '20px 0' }} />

        {/* DELETE ACCOUNT SECTION */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Trash2 size={18} style={{ color: '#fc8181' }} />
          <h2 style={{ margin: 0, color: '#fc8181' }}>Delete Account &amp; All Data</h2>
        </div>
        <p className="support-copy" style={{ marginBottom: '14px' }}>
          Permanently erase your account, all shipments, tickets, notification history, and attachments. You can register again with the same email at any time.
        </p>
        <div className="simple-actions">
          <button
            className="danger"
            type="button"
            onClick={() => {
              setIsDeleteModalOpen(true);
              setDeleteError(null);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Trash2 size={14} /> Delete my account
          </button>
        </div>
      </article>

      {/* ONE CONFIRMATION MODAL ASKING "Permanently delete your account and all your data?" */}
      {isDeleteModalOpen && (
        <>
          <div className="modal-backdrop" onClick={() => !deleteLoading && setIsDeleteModalOpen(false)} aria-hidden="true" />
          <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <div className="dialog-content">
              <div className="dialog-head">
                <div>
                  <p className="dialog-kicker" style={{ color: '#e53e3e' }}>Danger Zone</p>
                  <h2 id="delete-account-title">Permanently delete your account and all your data?</h2>
                  <p className="dialog-sub">This action immediately and irreversibly destroys all associated records.</p>
                </div>
                <button
                  className="dialog-close"
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => setIsDeleteModalOpen(false)}
                  aria-label="Close dialog"
                >
                  ×
                </button>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                    border: '1px solid color-mix(in srgb, #e53e3e 30%, var(--line))',
                    marginBottom: '16px',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '12px', color: '#e53e3e', marginBottom: '4px' }}>
                    The following records will be permanently erased:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: 'var(--ink)', lineHeight: '1.6' }}>
                    <li>Your profile and credentials from Neon database</li>
                    <li>All saved courier shipments and parcel histories</li>
                    <li>All customer care tickets and private screenshot attachments</li>
                    <li>All delivery alerts and active session tokens</li>
                  </ul>
                  <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                    After deletion completes, you can register fresh with the same email address whenever you want.
                  </p>
                </div>

                {deleteError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(229, 62, 62, 0.15)',
                      color: '#e53e3e',
                      fontSize: '12px',
                      marginBottom: '14px',
                    }}
                  >
                    {deleteError}
                  </div>
                )}

                <div className="dialog-actions">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className="danger"
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading}
                    style={{
                      backgroundColor: '#e53e3e',
                      borderColor: '#e53e3e',
                      color: '#ffffff',
                    }}
                  >
                    {deleteLoading ? 'Deleting all data...' : 'Permanently Delete Everything'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
