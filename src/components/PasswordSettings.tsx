import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password';
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '5px', fontWeight: 600 }}>
        {label} (required)
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          maxLength={128}
          minLength={8}
          style={{ width: '100%', padding: '9px 40px 9px 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--page)', color: 'var(--ink)', fontSize: '13px' }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          style={{
            position: 'absolute',
            right: 2,
            top: 2,
            bottom: 2,
            width: 40,
            padding: 0,
            background: 'transparent',
            color: 'var(--ink)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export function PasswordSettings({
  token,
  onChanged,
  onSignIn,
}: {
  token: string | null;
  onChanged: () => void;
  onSignIn: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !token) return;
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: password, confirmPassword: confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update password. Please re-verify your session.');
      }
      setPassword('');
      setConfirmation('');
      setIsOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change your password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="settings-card">
      <h2>Change password</h2>
      <p className="support-copy">
        Update your login password. Only your new password and confirmation are required.
      </p>

      {!token ? (
        <div className="support-copy">
          <p>Sign in to your account to change your password.</p>
          <div className="simple-actions">
            <button type="button" className="primary" onClick={onSignIn}>
              Sign in to change password
            </button>
          </div>
        </div>
      ) : !isOpen ? (
        <div className="simple-actions">
          <button type="button" className="primary" onClick={() => setIsOpen(true)}>
            Change password
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField label="Confirm password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
            {error && <p role="alert" style={{ color: '#e53e3e', fontSize: '12px', margin: '4px 0 10px' }}>{error}</p>}
            <div className="simple-actions" style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={busy || password.length < 8 || password !== confirmation}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </article>
  );
}

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      setMessage(data.message || 'If an account is associated with this email, a password reset link has been dispatched.');
    } catch {
      setMessage('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      <p className="support-copy">
        Enter your registered email address to receive an expiring, single-use password reset link.
      </p>
      <label htmlFor="recovery-email">Account email address (required)</label>
      <input
        id="recovery-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 12, background: 'var(--page)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }}
      />
      {message && <p role="alert" style={{ color: 'var(--ink)', fontSize: '12px', marginTop: 8 }}>{message}</p>}
      <div className="dialog-actions" style={{ marginTop: 16 }}>
        <button type="button" onClick={onBack}>
          Back to sign in
        </button>
        <button type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </div>
    </form>
  );
}
