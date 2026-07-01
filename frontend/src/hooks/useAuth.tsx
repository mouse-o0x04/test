import { Spin } from "antd";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe } from "../api/auth";
import type { AuthState, User } from "../types";

const AuthContext = createContext<AuthState | null>(null);

const ALL_PERMISSIONS = [
  "clients.view", "clients.create", "clients.edit", "clients.delete",
  "products.view", "products.create", "products.edit", "products.delete",
  "orders.view", "orders.create", "orders.edit", "orders.delete",
  "warehouse.view", "warehouse.create", "warehouse.edit", "warehouse.delete",
  "hermes.view", "hermes.manage",
  "users.view", "users.manage", "roles.manage",
  "prices.view", "prices.revenue",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  useEffect(() => {
    if (token && !user) {
      getMe()
        .then((u) => setUser(u))
        .catch(() => { setToken(null); localStorage.removeItem("token"); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, user]);

  const loginFn = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
  }, []);

  const hasPermission = (perm: string) => {
    if (user?.is_superuser) return true;
    return user?.permissions?.includes(perm) ?? false;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, login: loginFn, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
