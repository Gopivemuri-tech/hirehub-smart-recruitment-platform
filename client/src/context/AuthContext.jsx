import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("hirehub_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("hirehub_token")));

  useEffect(() => {
    const token = localStorage.getItem("hirehub_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api.get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem("hirehub_user", JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem("hirehub_token");
        localStorage.removeItem("hirehub_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function saveSession(data) {
    localStorage.setItem("hirehub_token", data.token);
    localStorage.setItem("hirehub_user", JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("hirehub_token");
    localStorage.removeItem("hirehub_user");
    setUser(null);
  }

  function updateUser(nextUser) {
    setUser(nextUser);
    localStorage.setItem("hirehub_user", JSON.stringify(nextUser));
  }

  const value = useMemo(() => ({
    user,
    loading,
    login: saveSession,
    logout,
    updateUser
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
