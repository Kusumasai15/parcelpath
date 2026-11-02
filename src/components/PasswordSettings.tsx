import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

function PasswordField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div style={{ marginBottom: 14 }}>
    <label htmlFor={id}>{label} (required)</label>
    <div style={{ position: 'relative' }}>
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        value={value} onChange={e => onChange(e.target.value)} required maxLength={128}
        minLength={autoComplete === 'new-password' ? 12 : undefined}
        style={{ width: '100%', paddingRight: 48 }} />
      <button type="button" onClick={() => setVisible(v => !v)} aria-controls={id}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
        style={{ position: 'absolute', right: 2, top: 2, bottom: 2, width: 44,
          padding: 0, background: 'transparent', color: 'var(--ink)', border: 'none' }}>
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>;
}

export function PasswordSettings({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password !== confirmation) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to change your password. Please try again.');
      setCurrent(''); setPassword(''); setConfirmation('');
      onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change your password.'); }
    finally { setBusy(false); }
  }
  return <article className="settings-card">
    <h2>Change password</h2>
    <p className="support-copy">Use 12–128 characters. Changing your password signs out all sessions. Then sign in with your new password.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        {error && <p role="alert" style={{ color: 'var(--ink)' }}>{error}</p>}
        <div className="simple-actions"><button className="primary" type="submit">{busy ? 'Updating…' : 'Change password'}</button></div>
      </fieldset>
    </form>
  </article>;
}

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      setMessage(data.error || 'Password recovery is currently unavailable. No reset email has been sent.');
    } catch { setMessage('Could not reach the server. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} style={{ marginTop: 16 }}>
    <p className="support-copy">Password recovery requires verification through your account email. Reset emails are not available yet.</p>
    <label htmlFor="recovery-email">Account email address (required)</label>
    <input id="recovery-email" type="email" autoComplete="email" required maxLength={254}
      value={email} onChange={e => setEmail(e.target.value)}
      style={{ width: '100%', padding: 12, background: 'var(--page)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8 }} />
    {message && <p role="alert" style={{ color: 'var(--ink)' }}>{message}</p>}
    <div className="dialog-actions" style={{ marginTop: 16 }}>
      <button type="button" onClick={onBack}>Back to sign in</button>
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Check recovery availability'}</button>
    </div>
  </form>;
}
