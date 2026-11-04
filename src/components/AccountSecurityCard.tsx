import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
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
  onOpenAuth,
  onRequireReauth,
}) => {
  // Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationMode, setVerificationMode] = useState<'code' | 'password'>('code');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyPasswordInput, setVerifyPasswordInput] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Two-Field Password Form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Delete Account State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteNeedsVerification, setDeleteNeedsVerification] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteCodeSent, setDeleteCodeSent] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

async function safeParseJson(res: Response): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      return { ok: res.ok, status: res.status, data, error: data.error };
    } catch {
      return { ok: res.ok, status: res.status, data: {}, error: 'Invalid JSON response from server.' };
    }
  }
  const text = await res.text().catch(() => '');
  const snippet = text.slice(0, 150).replace(/<[^>]+>/g, '').trim();
  return {
    ok: false,
    status: res.status,
    data: {},
    error: res.status === 404
      ? 'Endpoint not found (404).'
      : `Server returned ${res.status}${snippet ? `: ${snippet}` : ''}`,
  };
}

  if (!currentUser || !sessionToken) {
    return (
      <article className="settings-card">
        <h2>Account security &amp; password</h2>
        <p className="support-copy">Update your account password or manage security settings.</p>

        <div style={{ marginTop: '16px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <KeyRound size={18} style={{ color: 'var(--amber)' }} />
              <strong style={{ fontSize: '13px' }}>Change password</strong>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.45' }}>
              You are currently signed out. Sign in or complete verified recovery before changing your password.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="primary"
                onClick={() => onOpenAuth?.('login')}
              >
                Sign in to change password
              </button>
              <button
                type="button"
                className="details"
                onClick={() => onOpenAuth?.('forgot_password')}
              >
                Forgot password?
              </button>
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              marginTop: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Trash2 size={18} style={{ color: '#fc8181' }} />
              <strong style={{ fontSize: '13px', color: '#fc8181' }}>Delete account &amp; all data</strong>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.45' }}>
              Sign in to permanently erase your account, all shipments, customer care tickets, and preferences.
            </p>
            <button
              type="button"
              className="danger"
              onClick={() => onOpenAuth?.('login')}
            >
              Sign in to delete account
            </button>
          </div>
        </div>
      </article>
    );
  }

  // 1. Initiate Change Password
  const handleStartChangePassword = async () => {
    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    setVerificationError(null);
    setNewPassword('');
    setConfirmPassword('');

    try {
      const res = await fetch('/api/auth/session-status', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      if (data.isRecent) {
        setNeedsVerification(false);
      } else {
        setNeedsVerification(true);
        setCodeSent(false);
      }
    } catch {
      setNeedsVerification(true);
    }
  };

  // Request verification code for password change
  const handleRequestVerificationCode = async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const res = await fetch('/api/auth/request-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ action: 'change_password' }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodeSent(true);
      } else {
        throw new Error(data.error || 'Failed to send verification code.');
      }
    } catch (err: unknown) {
      setVerificationError(err instanceof Error ? err.message : 'Failed to send verification code.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // Verify session before password change
  const handleVerifySession = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationLoading(true);
    setVerificationError(null);

    const payload = verificationMode === 'code'
      ? { code: verificationCode.trim(), action: 'change_password' }
      : { password: verifyPasswordInput, action: 'change_password' };

    try {
      const res = await fetch('/api/auth/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed. Please check your credentials.');
      }

      setNeedsVerification(false);
      setVerificationCode('');
      setVerifyPasswordInput('');
    } catch (err: unknown) {
      setVerificationError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // Submit Two-Field Password Change
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
        if (data.needsVerification) {
          setNeedsVerification(true);
          throw new Error('Your session has timed out. Please re-verify to change your password.');
        }
        throw new Error(data.error || 'Failed to update password.');
      }

      if (data.sessionsRevoked) {
        setPasswordSuccess('Password successfully updated! All sessions have been revoked. Redirecting to sign in...');
        onNotice('Password updated. Please sign in with your new password.');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setIsChangingPassword(false);
          setPasswordSuccess(null);
          if (onRequireReauth) {
            onRequireReauth();
          } else {
            onAccountDeleted();
          }
        }, 2200);
        return;
      }

      setPasswordSuccess('Password successfully updated! All other active sessions have been invalidated.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsChangingPassword(false);
        setPasswordSuccess(null);
      }, 4000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // 2. Delete Account Logic
  const handleOpenDeleteModal = async () => {
    setIsDeleteModalOpen(true);
    setDeleteConfirmText('');
    setDeleteError(null);
    setDeleteCodeSent(false);

    try {
      const res = await fetch('/api/auth/session-status', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json();
      setDeleteNeedsVerification(!data.isRecent);
    } catch {
      setDeleteNeedsVerification(true);
    }
  };

  const handleRequestDeleteCode = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/auth/request-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ action: 'delete_account' }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteCodeSent(true);
      } else {
        throw new Error(data.error || 'Failed to send delete verification code.');
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to send verification code.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      // If verification needed, verify code first
      if (deleteNeedsVerification) {
        const verifyRes = await fetch('/api/auth/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ code: deleteCode.trim(), action: 'delete_account' }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) {
          throw new Error(verifyData.error || 'Invalid 6-digit security code.');
        }
      }

      // Execute permanent deletion
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete account.');
      }

      setIsDeleteModalOpen(false);
      onNotice('Your account, shipments, customer tickets, alerts, and sessions have been permanently deleted.');
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
          <div className="simple-actions">
            <button
              className="primary"
              type="button"
              onClick={handleStartChangePassword}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <KeyRound size={15} /> Change password
            </button>
          </div>
        ) : needsVerification ? (
          /* SECURITY VERIFICATION STEP */
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
              <ShieldCheck size={20} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                  Security Verification Required
                </h4>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.45, color: 'var(--muted)' }}>
                  To protect your account, please verify your session before changing your password.
                </p>
              </div>
            </div>

            {verificationError && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                  color: '#e53e3e',
                  fontSize: '11px',
                  marginBottom: '12px',
                }}
              >
                {verificationError}
              </div>
            )}

            <form onSubmit={handleVerifySession}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="radio"
                    name="verify-mode"
                    checked={verificationMode === 'code'}
                    onChange={() => setVerificationMode('code')}
                  />
                  <span>Email security code</span>
                </label>
                <label style={{ fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="radio"
                    name="verify-mode"
                    checked={verificationMode === 'password'}
                    onChange={() => setVerificationMode('password')}
                  />
                  <span>Current account password</span>
                </label>
              </div>

              {verificationMode === 'code' ? (
                <div>
                  {!codeSent ? (
                    <button
                      type="button"
                      onClick={handleRequestVerificationCode}
                      disabled={verificationLoading}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        background: 'var(--amber)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: '12px',
                      }}
                    >
                      {verificationLoading ? 'Sending code...' : `Send 6-digit code to ${currentUser.email}`}
                    </button>
                  ) : (
                    <div>
                      <p style={{ fontSize: '11px', color: '#38a169', margin: '0 0 8px', fontWeight: 500 }}>
                        ✓ 6-digit code sent to {currentUser.email}. Enter it below:
                      </p>
                      <input
                        type="text"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="123456"
                        required
                        style={{
                          width: '100%',
                          maxWidth: '220px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          background: 'var(--page)',
                          color: 'var(--ink)',
                          fontSize: '14px',
                          letterSpacing: '3px',
                          fontWeight: 700,
                          textAlign: 'center',
                          marginBottom: '12px',
                          display: 'block',
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <label htmlFor="verify-pwd-input" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                    Current Password
                  </label>
                  <input
                    id="verify-pwd-input"
                    type="password"
                    value={verifyPasswordInput}
                    onChange={(e) => setVerifyPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      maxWidth: '280px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsChangingPassword(false)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                {(codeSent || verificationMode === 'password') && (
                  <button
                    type="submit"
                    className="primary"
                    disabled={verificationLoading || (verificationMode === 'code' ? verificationCode.length < 6 : !verifyPasswordInput)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  >
                    {verificationLoading ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : (
          /* TWO-FIELD PASSWORD FORM (NO CURRENT PASSWORD FIELD REQUIRED) */
          <form onSubmit={handleSubmitPasswordChange} style={{ maxWidth: '420px' }}>
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

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '24px 0' }} />

        {/* DELETE ACCOUNT SECTION */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Trash2 size={18} style={{ color: '#fc8181' }} />
          <h2 style={{ margin: 0, color: '#fc8181' }}>Delete Account &amp; All Data</h2>
        </div>
        <p className="support-copy" style={{ marginBottom: '14px' }}>
          Permanently erase your account, all saved parcels, customer care tickets, notification history, and attachments. This operation cannot be undone.
        </p>
        <div className="simple-actions">
          <button
            className="danger"
            type="button"
            onClick={handleOpenDeleteModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Trash2 size={14} /> Delete account &amp; all data
          </button>
        </div>
      </article>

      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <>
          <div className="modal-backdrop" onClick={() => !deleteLoading && setIsDeleteModalOpen(false)} aria-hidden="true" />
          <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <div className="dialog-content">
              <div className="dialog-head">
                <div>
                  <p className="dialog-kicker" style={{ color: '#e53e3e' }}>Danger Zone</p>
                  <h2 id="delete-account-title">Permanently Delete Account?</h2>
                  <p className="dialog-sub">This action immediately and irreversibly destroys all associated data.</p>
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
                    <li>Your user profile, email credentials, and authentication records</li>
                    <li>All active and delivered shipments with full tracking timelines</li>
                    <li>All customer care support requests and private screenshot attachments</li>
                    <li>All delivery alerts, reminder preferences, and session tokens</li>
                  </ul>
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

                {deleteNeedsVerification && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--ink)', marginBottom: '8px' }}>
                      <strong>Recent security check required:</strong> Send a 6-digit confirmation code to <strong>{currentUser.email}</strong>.
                    </p>
                    {!deleteCodeSent ? (
                      <button
                        type="button"
                        onClick={handleRequestDeleteCode}
                        disabled={deleteLoading}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '6px',
                          background: 'var(--amber)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {deleteLoading ? 'Sending...' : 'Send 6-digit code to email'}
                      </button>
                    ) : (
                      <div>
                        <input
                          type="text"
                          maxLength={6}
                          value={deleteCode}
                          onChange={(e) => setDeleteCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            background: 'var(--page)',
                            color: 'var(--ink)',
                            fontSize: '13px',
                            marginBottom: '6px',
                          }}
                        />
                        <span style={{ fontSize: '11px', color: '#38a169' }}>
                          ✓ Code sent to {currentUser.email}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                  <label htmlFor="confirm-delete-input" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                    To confirm, please type <strong style={{ color: '#e53e3e' }}>DELETE</strong> in uppercase:
                  </label>
                  <input
                    id="confirm-delete-input"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    style={{
                      width: '100%',
                      padding: '9px 11px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  />
                </div>

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
                    disabled={
                      deleteLoading ||
                      deleteConfirmText.trim().toUpperCase() !== 'DELETE' ||
                      (deleteNeedsVerification && deleteCode.trim().length < 6)
                    }
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
