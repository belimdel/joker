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

type AuthView = 'login' | 'register' | null;

type AuthContextValue = {
  user: PublicUser | null;
  authLoading: boolean;       // vrai pendant le GET /me initial
  authError: string | null;
  authView: AuthView;         // écran auth affiché ('login' | 'register' | null)

  showLogin: () => void;
  showRegister: () => void;
  closeAuthView: () => void;

  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authView, setAuthView] = useState<AuthView>(null);

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
      return true;
    }
    setAuthError(res.error);
    return false;
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string): Promise<boolean> => {
      setAuthError(null);
      const res = await api.register(email, username, password);
      if (res.ok) {
        setUser(res.data.user);
        setAuthView(null);
        return true;
      }
      setAuthError(res.error);
      return false;
    },
    []
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setAuthView(null);
  }, []);

  const showLogin = useCallback(() => { setAuthError(null); setAuthView('login'); }, []);
  const showRegister = useCallback(() => { setAuthError(null); setAuthView('register'); }, []);
  const closeAuthView = useCallback(() => { setAuthError(null); setAuthView(null); }, []);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user, authLoading, authError, authView,
      showLogin, showRegister, closeAuthView,
      login, register, logout, clearAuthError,
    }),
    [user, authLoading, authError, authView, showLogin, showRegister, closeAuthView, login, register, logout, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>.');
  return ctx;
}
