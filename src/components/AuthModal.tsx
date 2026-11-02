import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ForgotPasswordForm } from './PasswordSettings';
import { UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  const [isForgot, setIsForgot] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShowPassword(false);
    setPassword('');
    setError(null);
    setIsForgot(false);
  }, [isOpen, isRegister, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister ? { name, email, password } : { email, password };

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

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="custom-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="dialog-kicker">Account Access</p>
              <h2 id="auth-modal-title">
                {currentUser ? 'Your Account' : isForgot ? 'Forgot password?' : isRegister ? 'Create ParcelPath Account' : 'Sign in to ParcelPath'}
              </h2>
              <p className="dialog-sub">
                {currentUser
                  ? `Signed in as ${currentUser.name} (${currentUser.email})`
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
          ) : isForgot ? (
            <ForgotPasswordForm onBack={() => setIsForgot(false)} />
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

              {isRegister && (
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="auth-name" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kusuma"
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
                <label htmlFor="auth-email" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
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

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="auth-password" style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 48px 10px 11px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--page)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-controls="auth-password"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: '2px',
                      top: 0,
                      bottom: 0,
                      width: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      border: 'none',
                      borderRadius: '6px',
                      background: 'transparent',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {!isRegister && <button type="button" onClick={() => { setPassword(''); setError(null); setIsForgot(true); }}
                style={{ marginBottom: 14, color: 'var(--ink)', background: 'transparent', border: 'none', textDecoration: 'underline' }}>
                Forgot password?
              </button>}
              <div className="dialog-actions">
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  style={{ marginRight: 'auto' }}
                >
                  {isRegister ? 'Already have an account? Sign in' : 'Create new account'}
                </button>
                <button className="report-from-details" type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : isRegister ? 'Register' : 'Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
