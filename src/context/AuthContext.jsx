import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading]         = useState(true); // hidrata desde localStorage al montar

  // Al montar: si hay token, recuperar perfil del servidor
  useEffect(() => {
    const token = localStorage.getItem('pc_token');
    if (!token) { setLoading(false); return; }

    authApi.me()
      .then(user => setCurrentUser(user))
      .catch(() => {
        localStorage.removeItem('pc_token');
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await authApi.login(email, password); // lanza si falla
    localStorage.setItem('pc_token', data.token);
    setCurrentUser(data.user);
    return { success: true, role: data.user.role };
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* ignorar */ }
    localStorage.removeItem('pc_token');
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
