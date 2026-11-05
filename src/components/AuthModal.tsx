import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, ArrowLeft, Shield, Copy, Check } from 'lucide-react';
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
  onLoginSuccess,
  initialEmail = '',
  initialView = 'login',
}) => {
  const [view, setView] = useState<'login' | 'register' | 'forgot_password' | 'recovery_show'>(initialView);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery (Forgot Password) state
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [showRecoveryNewPassword, setShowRecoveryNewPassword] = useState(false);
  const [showRecoveryConfirmPassword, setShowRecoveryConfirmPassword] = useState(false);

  // Registration newly generated recovery code display
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [registeredUser, setRegisteredUser] = useState<UserProfile | null>(null);
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      if (initialEmail) {
        setEmail(initialEmail);
        setRecoveryEmail(initialEmail);
      }
      setError(null);
      setNewRecoveryCode(null);
      setCopiedCode(false);
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
      error: `Server error (${res.status})${snippet ? `: ${snippet}` : ''}`,
    };
  }

  // Handle Login & Registration Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
        throw new Error(parsed.error || data.error || 'Authentication failed.');
      }

      // If Registration: Show recovery code once for the user to save!
      if (view === 'register' && data.recoveryCode) {
        setNewRecoveryCode(data.recoveryCode);
        setRegisteredUser(data.user);
        setRegisteredToken(data.token);
        setView('recovery_show');
        return;
      }

      // Login success
      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Account Recovery with Saved Code
  const handleRecoverAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (recoveryNewPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      setLoading(false);
      return;
    }

    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/recover-with-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recoveryEmail.trim().toLowerCase(),
          recoveryCode: recoveryCodeInput.trim(),
          newPassword: recoveryNewPassword,
          confirmPassword: recoveryConfirmPassword,
        }),
      });

      const parsed = await parseSafeResponse(res);
      const data = parsed.data;

      if (!parsed.ok) {
        throw new Error(parsed.error || data.error || 'Recovery failed. Please check your details.');
      }

      // Succeeded: log in with fresh session
      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNewRecoveryCode = () => {
    if (!newRecoveryCode) return;
    navigator.clipboard.writeText(newRecoveryCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleFinishRegistration = () => {
    if (registeredUser && registeredToken) {
      onLoginSuccess(registeredUser, registeredToken);
    }
    onClose();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">ParcelPath Account</p>
              <h2 id="auth-modal-title">
                {view === 'login' && 'Sign in to ParcelPath'}
                {view === 'register' && 'Create your account'}
                {view === 'forgot_password' && 'Recover account'}
                {view === 'recovery_show' && 'Save Your Recovery Code'}
              </h2>
              <p className="dialog-sub">
                {view === 'login' && 'Access all your real-time deliveries and honest ETAs.'}
                {view === 'register' && 'Track packages from Delhivery, Blue Dart, Amazon, and more.'}
                {view === 'forgot_password' && 'Enter your account email, saved recovery code, and new password.'}
                {view === 'recovery_show' && 'Save this code securely. It is the only way to recover your account.'}
              </p>
            </div>
            <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">
              ×
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            {error && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'color-mix(in srgb, #e53e3e 15%, var(--page))',
                  border: '1px solid color-mix(in srgb, #e53e3e 30%, var(--line))',
                  color: '#e53e3e',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{error}</span>
              </div>
            )}

            {/* --- RECOVERY CODE ON REGISTRATION: DISPLAY ONCE --- */}
            {view === 'recovery_show' && (
              <div>
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--line)',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Shield size={18} style={{ color: 'var(--amber)' }} />
                    <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>Your Secret Recovery Code</strong>
                  </div>
                  <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
                    Copy and save this recovery code in a password manager or safe place. If you ever forget your password, you will need this code to regain access.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <code
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '20px',
                        letterSpacing: '2px',
                        fontWeight: 700,
                        color: 'var(--amber)',
                        background: 'var(--page)',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        userSelect: 'all',
                        flex: '1',
                        minWidth: '220px',
                        textAlign: 'center',
                      }}
                    >
                      {newRecoveryCode}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyNewRecoveryCode}
                      className="details"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 16px',
                      }}
                    >
                      {copiedCode ? <Check size={16} style={{ color: '#38a169' }} /> : <Copy size={16} />}
                      {copiedCode ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: '11px', color: '#fc8181' }}>
                    ⚠️ This recovery code is stored only as a secure hash in the database and cannot be retrieved again.
                  </p>
                </div>

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleFinishRegistration}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    I have saved my recovery code — Continue to dashboard
                  </button>
                </div>
              </div>
            )}

            {/* --- RECOVERY FORM (FORGOT PASSWORD) --- */}
            {view === 'forgot_password' && (
              <form onSubmit={handleRecoverAccount}>
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="recovery-email" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    Account email address <span style={{ color: 'var(--amber)' }}>*</span>
                  </label>
                  <input
                    id="recovery-email"
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="recovery-code" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    Saved recovery code <span style={{ color: 'var(--amber)' }}>*</span>
                  </label>
                  <input
                    id="recovery-code"
                    type="text"
                    value={recoveryCodeInput}
                    onChange={(e) => setRecoveryCodeInput(e.target.value)}
                    placeholder="e.g. H7KR-9M2P-4WX8-T5YQ"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      letterSpacing: '1px',
                    }}
                  />
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                    Enter the 16-character recovery code generated during registration or in Settings.
                  </p>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="recovery-new-password" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    New password <span style={{ color: 'var(--amber)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="recovery-new-password"
                      type={showRecoveryNewPassword ? 'text' : 'password'}
                      value={recoveryNewPassword}
                      onChange={(e) => setRecoveryNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                      style={{
                        width: '100%',
                        padding: '10px 36px 10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--page)',
                        color: 'var(--ink)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryNewPassword(!showRecoveryNewPassword)}
                      aria-label={showRecoveryNewPassword ? 'Hide password' : 'Show password'}
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
                      }}
                    >
                      {showRecoveryNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label htmlFor="recovery-confirm-password" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    Confirm new password <span style={{ color: 'var(--amber)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="recovery-confirm-password"
                      type={showRecoveryConfirmPassword ? 'text' : 'password'}
                      value={recoveryConfirmPassword}
                      onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                      minLength={8}
                      style={{
                        width: '100%',
                        padding: '10px 36px 10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--page)',
                        color: 'var(--ink)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryConfirmPassword(!showRecoveryConfirmPassword)}
                      aria-label={showRecoveryConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
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
                      }}
                    >
                      {showRecoveryConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError(null);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ArrowLeft size={14} /> Back to Sign in
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={loading || !recoveryEmail || !recoveryCodeInput || recoveryNewPassword.length < 8}
                  >
                    {loading ? 'Recovering...' : 'Reset Password with Code'}
                  </button>
                </div>
              </form>
            )}

            {/* --- SIGN IN & REGISTER FORMS --- */}
            {(view === 'login' || view === 'register') && (
              <form onSubmit={handleSubmit}>
                {view === 'register' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label htmlFor="auth-name" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                      Your name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Kusuma"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--page)',
                        color: 'var(--ink)',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="auth-email" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
                    Email address <span style={{ color: 'var(--amber)' }}>*</span>
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
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--page)',
                      color: 'var(--ink)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label htmlFor="auth-password" style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                      Password <span style={{ color: 'var(--amber)' }}>*</span>
                    </label>
                    {view === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setView('forgot_password');
                          setRecoveryEmail(email);
                          setError(null);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-text)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                      style={{
                        width: '100%',
                        padding: '10px 36px 10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--page)',
                        color: 'var(--ink)',
                        fontSize: '13px',
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
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setView(view === 'login' ? 'register' : 'login');
                      setError(null);
                    }}
                    style={{ fontSize: '12px' }}
                  >
                    {view === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                  </button>
                  <button
                    className="primary"
                    type="submit"
                    disabled={loading || !email || password.length < 8}
                  >
                    {loading ? 'Please wait...' : view === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
