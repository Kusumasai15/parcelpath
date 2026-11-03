import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
  initialEmail?: string;
  initialView?: 'login' | 'register' | 'forgot_password';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
  initialEmail = '',
  initialView = 'login',
}) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot_password'>(initialView);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [testResetUrl, setTestResetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      if (initialEmail) {
        setEmail(initialEmail);
        setForgotEmail(initialEmail);
      }
      setError(null);
      setForgotSuccess(null);
      setTestResetUrl(null);
    }
  }, [isOpen, initialView, initialEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = view === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = view === 'register' ? { name, email, password } : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setForgotSuccess(null);
    setTestResetUrl(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch reset link.');
      }

      // CRITICAL: Generic response that does not reveal registration status
      setForgotSuccess(data.message || 'If an account is associated with this email, a password reset link has been dispatched.');

      // Check test inbox for immediate verification link during testing/local dev
      try {
        const inboxRes = await fetch('/api/auth/test-inbox');
        if (inboxRes.ok) {
          const inboxData = await inboxRes.json();
          const latest = (inboxData.messages || []).find((m: any) => m.type === 'password_reset' && m.to.toLowerCase() === forgotEmail.trim().toLowerCase());
          if (latest?.resetUrl) {
            setTestResetUrl(latest.resetUrl);
          }
        }
      } catch (ignored) {
        // Test inbox check optional
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send password reset request.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchToDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'saddikutikusumasai@gmail.com', password: 'welcome123' }),
      });
      const data = await res.json();
      if (res.ok) {
        onLoginSuccess(data.user, data.token);
        onClose();
      } else {
        setError(data.error || 'Demo account is not available.');
      }
    } catch (e) {
      console.error(e);
      setError('Failed to connect to demo account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Account Access</p>
              <h2 id="auth-modal-title">
                {currentUser
                  ? 'Your Account'
                  : view === 'forgot_password'
                  ? 'Reset Password'
                  : view === 'register'
                  ? 'Create ParcelPath Account'
                  : 'Sign in to ParcelPath'}
              </h2>
              <p className="dialog-sub">
                {currentUser
                  ? `Signed in as ${currentUser.name} (${currentUser.email})`
                  : view === 'forgot_password'
                  ? 'Enter your registered email to receive an expiring reset link.'
                  : 'Manage multiple deliveries across sessions and devices.'}
              </p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          {currentUser ? (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  padding: '14px',
                  borderRadius: '11px',
                  backgroundColor: 'color-mix(in srgb, var(--surface-raised) 85%, var(--mauve))',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '15px' }}>
                    {currentUser.avatarInitial}
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px' }}>{currentUser.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{currentUser.email}</span>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.45', margin: '0 0 16px' }}>
                Each user account is securely isolated. Only you can view and edit your parcels, backup recipient notes, and support tickets.
              </p>

              <div className="dialog-actions">
                <button type="button" onClick={onClose}>
                  Done
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  style={{ color: '#fc8181', borderColor: 'rgba(229, 62, 62, 0.4)' }}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : view === 'forgot_password' ? (
            /* FORGOT PASSWORD FORM */
            <form onSubmit={handleForgotPassword} style={{ marginTop: '16px' }}>
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

              {forgotSuccess ? (
                <div style={{ padding: '8px 0' }}>
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      backgroundColor: 'color-mix(in srgb, #38a169 15%, var(--page))',
                      border: '1px solid color-mix(in srgb, #38a169 35%, var(--line))',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <CheckCircle2 size={18} style={{ color: '#38a169', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                          Reset Link Sent
                        </h4>
                        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--ink)' }}>
                          {forgotSuccess}
                        </p>
                      </div>
                    </div>
                  </div>

                  {testResetUrl && (
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'var(--surface-raised)',
                        border: '1px dashed var(--amber)',
                        marginBottom: '16px',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--amber)', display: 'block', marginBottom: '4px' }}>
                        🔗 Authorized Test Link (Development &amp; Verification):
                      </span>
                      <a
                        href={testResetUrl}
                        style={{
                          fontSize: '11px',
                          color: 'var(--ink)',
                          wordBreak: 'break-all',
                          textDecoration: 'underline',
                          fontWeight: 500,
                        }}
                      >
                        Open Generated Reset Link →
                      </a>
                    </div>
                  )}

                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="report-from-details"
                      onClick={() => {
                        setView('login');
                        setForgotSuccess(null);
                      }}
                    >
                      Return to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label
                      htmlFor="forgot-email"
                      style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
                    >
                      Registered Email Address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      autoFocus
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
                    <p style={{ margin: '5px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                      We will send an expiring, single-use reset link. Your existing password will remain active until updated.
                    </p>
                  </div>

                  <div className="dialog-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setError(null);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                    <button className="report-from-details" type="submit" disabled={loading || !forgotEmail.trim()}>
                      {loading ? 'Sending link...' : 'Send Reset Link'}
                    </button>
                  </div>
                </>
              )}
            </form>
          ) : (
            /* SIGN IN OR REGISTER FORM */
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

              {view === 'register' && (
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="auth-name" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Sharma"
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
              )}

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="auth-email" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
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

              <div style={{ marginBottom: '6px' }}>
                <label htmlFor="auth-password" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 36px 10px 11px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* FORGOT PASSWORD LINK BELOW SIGN IN */}
              {view === 'login' && (
                <div style={{ textAlign: 'right', marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot_password');
                      setForgotEmail(email);
                      setError(null);
                      setForgotSuccess(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--amber)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '3px 0',
                      textDecoration: 'underline',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <div className="dialog-actions" style={{ marginTop: view === 'register' ? '18px' : '0' }}>
                <button
                  type="button"
                  onClick={() => {
                    setView(view === 'register' ? 'login' : 'register');
                    setError(null);
                  }}
                  style={{ marginRight: 'auto' }}
                >
                  {view === 'register' ? 'Already have an account? Sign in' : 'Create new account'}
                </button>
                {view === 'login' && (
                  <button type="button" onClick={switchToDemo} disabled={loading}>
                    Demo Account (Kusuma)
                  </button>
                )}
                <button className="report-from-details" type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : view === 'register' ? 'Register' : 'Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
