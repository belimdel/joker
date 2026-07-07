import { useState } from 'react';
import { useAuth } from '../AuthContext';
import './screens.css';

export function Register() {
  const { register, authError, clearAuthError, showLogin, closeAuthView } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await register(email.trim(), username.trim(), password);
    setLoading(false);
  }

  return (
    <div className="jk-home jk-home--auth">
      <header className="jk-home__head jk-fade-up">
        <div className="jk-eyebrow">Salon de cartes géorgien</div>
        <h1 className="jk-brand jk-home__title">Joker</h1>
      </header>

      <div className="jk-panel jk-home__panel jk-fade-up">
        <h2 className="jk-auth__title">Créer un compte</h2>

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
            <label className="jk-label">Pseudo (3-20 caractères, lettres/chiffres/_)</label>
            <input
              className="jk-input"
              value={username}
              onChange={(e) => { setUsername(e.target.value); clearAuthError(); }}
              placeholder="MonPseudo"
              maxLength={20}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="jk-label">Mot de passe (8 caractères min.)</label>
            <input
              className="jk-input"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearAuthError(); }}
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
          </div>

          {authError && <div className="jk-error">⚠ {authError}</div>}

          <button
            className="jk-btn jk-btn--primary jk-btn--block"
            type="submit"
            disabled={loading || !email || !username || password.length < 8}
          >
            {loading ? 'Création…' : 'Créer le compte'}
          </button>

          <button
            className="jk-btn jk-btn--ghost jk-btn--block"
            type="button"
            onClick={showLogin}
          >
            Déjà un compte ? Se connecter
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
