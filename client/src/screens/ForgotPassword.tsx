import { useState } from 'react';
import { useAuth } from '../AuthContext';
import './screens.css';

export function ForgotPassword() {
  const { requestPasswordReset, showLogin, closeAuthView, authError, clearAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Réponse toujours 204 (anti-énumération) : on passe systématiquement à
    // l'écran de saisie du code, sans révéler si le compte existe.
    await requestPasswordReset(email.trim().toLowerCase());
    setLoading(false);
  }

  return (
    <div className="jk-home jk-home--auth">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
      </header>

      <div className="jk-panel jk-home__panel jk-fade-up">
        <h2 className="jk-auth__title">Mot de passe oublié</h2>
        <p className="jk-home__sub" style={{ marginTop: 0 }}>
          Saisis ton email : si un compte existe, tu recevras un code à 6 chiffres
          pour choisir un nouveau mot de passe.
        </p>

        <form className="jk-form" onSubmit={handleSubmit}>
          <div>
            <label className="jk-label">Email</label>
            <input
              className="jk-input"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearAuthError(); }}
              placeholder="ton@email.com"
              autoComplete="email"
              required
            />
          </div>

          {authError && <div className="jk-error">⚠ {authError}</div>}

          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            type="submit"
            disabled={loading || !email}
          >
            {loading ? 'Envoi…' : 'Envoyer le code'}
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={showLogin}
          >
            ← Retour à la connexion
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
