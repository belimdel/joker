import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type PublicUser } from './api';
import { renewIdentity } from './socket';

type AuthView = 'login' | 'register' | 'verify' | null;

type AuthContextValue = {
  user: PublicUser | null;
  authLoading: boolean;       // vrai pendant le GET /me initial
  authError: string | null;
  authView: AuthView;         // écran auth affiché ('login' | 'register' | 'verify' | null)
  pendingEmail: string | null; // email en cours de vérification (écran 'verify')

  showLogin: () => void;
  showRegister: () => void;
  closeAuthView: () => void;

  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string) => Promise<boolean>;
  verifyEmail: (code: string) => Promise<boolean>;
  resendCode: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authView, setAuthView] = useState<AuthView>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Vérifier la session au boot (cookie httpOnly → /me).
  useEffect(() => {
    api.me().then((res) => {
      if (res.ok) setUser(res.data.user);
      setAuthLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    const res = await api.login(email, password);
    if (res.ok) {
      setUser(res.data.user);
      setAuthView(null);
      // Nouvelle identité : on oublie la session de partie de l'ancienne
      // (invité ou autre compte) et on reconnecte le socket avec le cookie.
      renewIdentity();
      return true;
    }
    // Compte non vérifié → basculer sur l'écran de vérification (email pré-rempli).
    if (res.code === 'EMAIL_NOT_VERIFIED') {
      setPendingEmail(email);
      setAuthError('Ton compte n\'est pas encore vérifié. Saisis le code reçu par email.');
      setAuthView('verify');
      return false;
    }
    setAuthError(res.error);
    return false;
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string): Promise<boolean> => {
      setAuthError(null);
      const res = await api.register(email, username, password);
      if (res.ok) {
        // Pas de session : on passe à l'écran de vérification par code.
        setPendingEmail(email);
        setAuthView('verify');
        return true;
      }
      setAuthError(res.error);
      return false;
    },
    []
  );

  // Vérifie le code : succès → l'utilisateur est connecté (cookie posé serveur).
  const verifyEmail = useCallback(async (code: string): Promise<boolean> => {
    if (!pendingEmail) return false;
    setAuthError(null);
    const res = await api.verifyEmail(pendingEmail, code);
    if (res.ok) {
      setUser(res.data.user);
      setPendingEmail(null);
      setAuthView(null);
      // Compte créé et connecté : l'identité invité de ce navigateur est
      // oubliée (session de partie comprise).
      renewIdentity();
      return true;
    }
    setAuthError(res.error);
    return false;
  }, [pendingEmail]);

  // Renvoie un code (réponse toujours 204 : on n'affiche jamais d'erreur ici).
  const resendCode = useCallback(async (): Promise<void> => {
    if (!pendingEmail) return;
    await api.resendCode(pendingEmail);
  }, [pendingEmail]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setAuthView(null);
    // Le compte est parti : la session de partie lui appartenait, on ne la
    // transmet pas au prochain utilisateur de l'appareil (invité ou autre).
    renewIdentity();
  }, []);

  const showLogin = useCallback(() => { setAuthError(null); setAuthView('login'); }, []);
  const showRegister = useCallback(() => { setAuthError(null); setAuthView('register'); }, []);
  const closeAuthView = useCallback(() => { setAuthError(null); setPendingEmail(null); setAuthView(null); }, []);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user, authLoading, authError, authView, pendingEmail,
      showLogin, showRegister, closeAuthView,
      login, register, verifyEmail, resendCode, logout, clearAuthError,
    }),
    [user, authLoading, authError, authView, pendingEmail, showLogin, showRegister, closeAuthView, login, register, verifyEmail, resendCode, logout, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
