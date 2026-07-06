import { useState } from 'react';
import { useAuth } from '../AuthContext';
import './screens.css';

export function Login() {
  const { login, authError, clearAuthError, showRegister, closeAuthView } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await login(email.trim(), password);
    setLoading(false);
  }

  return (
    <div className="jk-home">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
      </header>

      <div className="jk-panel jk-home__panel jk-fade-up">
        <h2 className="jk-auth__title">Se connecter</h2>

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
          <div>
            <label className="jk-label">Mot de passe</label>
            <input
              className="jk-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearAuthError(); }}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {authError && <div className="jk-error">⚠ {authError}</div>}

          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={showRegister}
          >
            Créer un compte
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={closeAuthView}
          >
            Continuer en invité
          </button>
        </form>
      </div>
    </div>
  );
}
