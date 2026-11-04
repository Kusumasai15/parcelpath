import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, ArrowLeft, Mail, RefreshCw, AlertCircle } from 'lucide-react';
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
  const [view, setView] = useState<'login' | 'register' | 'forgot_password' | 'verify_pending'>(initialView);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verification state
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [isUnverifiedNotice, setIsUnverifiedNotice] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [testResetUrl, setTestResetUrl] = useState<string | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

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
      setIsUnverifiedNotice(false);
    }
  }, [isOpen, initialView, initialEmail]);

  if (!isOpen) return null;

async function parseSafeResponse(res: Response): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
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
      ? 'Authentication service endpoint not found (404). Please ensure the backend server is running.'
      : `Server returned an error (${res.status})${snippet ? `: ${snippet}` : ''}`,
  };
}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsUnverifiedNotice(false);

    const normEmail = email.trim().toLowerCase();
    const endpoint = view === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = view === 'register' ? { name, email: normEmail, password } : { email: normEmail, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const parsed = await parseSafeResponse(res);
      const data = parsed.data;

      if (!parsed.ok) {
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setIsUnverifiedNotice(true);
          setVerificationEmail(normEmail);
          if (data.verificationUrl) setVerificationUrl(data.verificationUrl);
          if (data.verificationCode) setVerificationCode(data.verificationCode);
          setError('Your email address is not verified yet. Please check your inbox or verify using the code below.');
          return;
        }
        if (data.code === 'ACCOUNT_EXISTS') {
          throw new Error(data.error || 'An account with this email already exists. Please sign in or reset your password.');
        }
        throw new Error(parsed.error || data.error || 'Authentication failed.');
      }

      if (view === 'register' && data.requiresVerification) {
        setVerificationEmail(normEmail);
        setVerificationUrl(data.verificationUrl || null);
        if (data.verificationCode) setVerificationCode(data.verificationCode);
        setVerificationNotice(data.message || 'Please check your email to verify your account.');
        setView('verify_pending');
        setCooldown(60);
        return;
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

  const handleResendVerification = async (targetEmail: string) => {
    if (cooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim().toLowerCase() }),
      });

      const parsed = await parseSafeResponse(res);
      const data = parsed.data;

      if (!parsed.ok) {
        if (data.cooldownRemaining) {
          setCooldown(data.cooldownRemaining);
        }
        throw new Error(parsed.error || data.error || 'Failed to resend verification email.');
      }

      setCooldown(60);
      setVerificationEmail(targetEmail);
      if (data.verificationUrl) {
        setVerificationUrl(data.verificationUrl);
      }
      if (data.verificationCode) {
        setVerificationCode(data.verificationCode);
      }
      setVerificationNotice(data.message || 'A fresh verification email has been sent.');
      if (view !== 'verify_pending') {
        setView('verify_pending');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode.trim() }),
      });

      const parsed = await parseSafeResponse(res);
      const data = parsed.data;

      if (!parsed.ok) {
        throw new Error(parsed.error || data.error || 'Invalid or expired verification code.');
      }

      if (data.token && data.user) {
        onLoginSuccess(data.user, data.token);
        onClose();
      } else {
        setView('login');
        setError(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
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
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });

      const parsed = await parseSafeResponse(res);
      const data = parsed.data;

      if (!parsed.ok) {
        throw new Error(parsed.error || data.error || 'Failed to dispatch reset link.');
      }

      // CRITICAL: Generic response that does not reveal registration status
      setForgotSuccess(data.message || 'If an account is associated with this email, a password reset link has been dispatched.');

      // Check test inbox for immediate verification link during testing/local dev
      try {
        const inboxRes = await fetch('/api/auth/test-inbox');
        if (inboxRes.ok) {
          const inboxData = await inboxRes.json();
          const latest = (inboxData.messages || []).find(
            (m: any) => m.type === 'password_reset' && m.to.toLowerCase() === forgotEmail.trim().toLowerCase()
          );
          if (latest?.resetUrl) {
            setTestResetUrl(latest.resetUrl);
          }
        }
      } catch (ignored) {
        // Optional
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send password reset request.';
      setError(msg);
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
                  : view === 'verify_pending'
                  ? 'Verify Your Email'
                  : view === 'register'
                  ? 'Create ParcelPath Account'
                  : 'Sign in to ParcelPath'}
              </h2>
              <p className="dialog-sub">
                {currentUser
                  ? `Signed in as ${currentUser.name} (${currentUser.email})`
                  : view === 'forgot_password'
                  ? 'Enter your registered email to receive an expiring reset link.'
                  : view === 'verify_pending'
                  ? `Enter the 6-digit code or click the link sent to ${verificationEmail}.`
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
          ) : view === 'verify_pending' ? (
            /* EMAIL VERIFICATION PENDING VIEW */
            <div style={{ marginTop: '16px' }}>
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

              {verificationNotice && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, #38a169 15%, var(--page))',
                    border: '1px solid color-mix(in srgb, #38a169 35%, var(--line))',
                    marginBottom: '16px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} style={{ color: '#38a169', flexShrink: 0 }} />
                  <span>{verificationNotice}</span>
                </div>
              )}

              {verificationUrl && (
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
                    🔗 Direct Verification Link:
                  </span>
                  <a
                    href={verificationUrl}
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink)',
                      wordBreak: 'break-all',
                      textDecoration: 'underline',
                      fontWeight: 500,
                    }}
                  >
                    Click to Verify Email &amp; Activate Account →
                  </a>
                </div>
              )}

              <form onSubmit={handleVerifyCode}>
                <div style={{ marginBottom: '16px' }}>
                  <label
                    htmlFor="verify-input-code"
                    style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}
                  >
                    6-Digit Security Code
                  </label>
                  <input
                    id="verify-input-code"
                    type="text"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      letterSpacing: '0.25em',
                      fontFamily: 'monospace',
                      fontSize: '16px',
                      textAlign: 'center',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                    }}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                    Verification emails are valid for 24 hours. Check your spam folder if you do not see it.
                  </p>
                </div>

                <div className="dialog-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError(null);
                    }}
                  >
                    Back to Sign In
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResendVerification(verificationEmail)}
                    disabled={resendLoading || cooldown > 0}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={14} className={resendLoading ? 'animate-spin' : ''} />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
                  </button>

                  <button
                    className="report-from-details"
                    type="submit"
                    disabled={loading || verificationCode.length < 6}
                  >
                    {loading ? 'Verifying...' : 'Verify Code'}
                  </button>
                </div>
              </form>
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
                        🔗 Authorized Reset Link (Development &amp; Verification):
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1 }}>
                      <div>{error}</div>
                      {isUnverifiedNotice && (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              setView('verify_pending');
                              setError(null);
                            }}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            Enter 6-digit code or link →
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResendVerification(email)}
                            disabled={resendLoading || cooldown > 0}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              background: 'var(--surface)',
                              border: '1px solid var(--line)',
                              color: 'var(--ink)',
                              cursor: 'pointer',
                            }}
                          >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
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
                  Password {view === 'register' && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(minimum 8 characters)</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={view === 'register' ? 8 : undefined}
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
