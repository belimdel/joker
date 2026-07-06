import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import './screens.css';

const RESEND_COOLDOWN_S = 60;

export function VerifyEmail() {
  const { pendingEmail, verifyEmail, resendCode, authError, clearAuthError, closeAuthView } = useAuth();
  const [code, setCode] = useState('');
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
    setLoading(true);
    await verifyEmail(code.trim());
    setLoading(false);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    clearAuthError();
    await resendCode();
    setResentNotice(true);
    setCooldown(RESEND_COOLDOWN_S);
    window.setTimeout(() => setResentNotice(false), 4000);
  }

  return (
    <div className="jk-home">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
      </header>

      <div className="jk-panel jk-home__panel jk-fade-up">
        <h2 className="jk-auth__title">Vérifie ton email</h2>
        <p className="jk-home__sub" style={{ marginTop: 0 }}>
          Un code à 6 chiffres a été envoyé à <strong>{pendingEmail}</strong>. Il expire dans 15 minutes.
        </p>

        <form className="jk-form" onSubmit={handleSubmit}>
          <div>
            <label className="jk-label">Email</label>
            <input
              className="jk-input"
              type="email"
              value={pendingEmail ?? ''}
              readOnly
              style={{ opacity: 0.7, cursor: 'default' }}
            />
          </div>
          <div>
            <label className="jk-label">Code de vérification</label>
            <input
              className="jk-input jk-input--code"
              inputMode="numeric"
              value={code}
              maxLength={6}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); clearAuthError(); }}
              placeholder="000000"
              autoComplete="one-time-code"
              required
            />
          </div>

          {authError && <div className="jk-error">⚠ {authError}</div>}
          {resentNotice && (
            <div
              className="jk-error"
              style={{
                background: 'rgba(123, 158, 232, 0.14)',
                borderColor: 'rgba(123, 158, 232, 0.5)',
                color: '#d9e4ff',
              }}
            >
              ℹ Si le compte existe et n'est pas vérifié, un nouveau code a été envoyé.
            </div>
          )}

          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            type="submit"
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Vérification…' : 'Valider'}
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
