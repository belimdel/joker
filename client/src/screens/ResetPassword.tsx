import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import './screens.css';

const RESEND_COOLDOWN_S = 60;

export function ResetPassword() {
  const { pendingEmail, resetPassword, resendResetCode, authError, clearAuthError, closeAuthView } = useAuth();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Compte à rebours avant de pouvoir renvoyer un code (aligné sur le
  // cooldown serveur de 60 s). Démarre plein : un code vient d'être envoyé.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resentNotice, setResentNotice] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timerRef.current);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setLocalError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    await resetPassword(code.trim(), password);
    setLoading(false);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    clearAuthError();
    setLocalError(null);
    await resendResetCode();
    setResentNotice(true);
    setCooldown(RESEND_COOLDOWN_S);
    window.setTimeout(() => setResentNotice(false), 4000);
  }

  const shownError = localError ?? authError;

  return (
    <div className="jk-home jk-home--auth">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
      </header>

      <div className="jk-panel jk-home__panel jk-fade-up">
        <h2 className="jk-auth__title">Nouveau mot de passe</h2>
        <p className="jk-home__sub" style={{ marginTop: 0 }}>
          Si un compte existe pour <strong>{pendingEmail}</strong>, un code à
          6 chiffres vient d'être envoyé. Il expire dans 15 minutes.
        </p>

        <form className="jk-form" onSubmit={handleSubmit}>
          <div>
            <label className="jk-label">Code reçu par email</label>
            <input
              className="jk-input jk-input--code"
              inputMode="numeric"
              value={code}
              maxLength={6}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); clearAuthError(); setLocalError(null); }}
              placeholder="000000"
              autoComplete="one-time-code"
              required
            />
          </div>
          <div>
            <label className="jk-label">Nouveau mot de passe</label>
            <input
              className="jk-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearAuthError(); setLocalError(null); }}
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="jk-label">Confirmer le mot de passe</label>
            <input
              className="jk-input"
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clearAuthError(); setLocalError(null); }}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
          </div>

          {shownError && <div className="jk-error">⚠ {shownError}</div>}
          {resentNotice && (
            <div
              className="jk-error"
              style={{
                background: 'rgba(123, 158, 232, 0.14)',
                borderColor: 'rgba(123, 158, 232, 0.5)',
                color: '#d9e4ff',
              }}
            >
              ℹ Si le compte existe, un nouveau code a été envoyé.
            </div>
          )}

          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            type="submit"
            disabled={loading || code.length !== 6 || !password || !confirm}
          >
            {loading ? 'Réinitialisation…' : 'Changer le mot de passe'}
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
          >
            {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : 'Renvoyer le code'}
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={closeAuthView}
          >
            Annuler
          </button>
        </form>
      </div>
    </div>
  );
}
