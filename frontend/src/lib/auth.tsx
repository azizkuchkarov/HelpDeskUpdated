"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth as authApi } from "./api";

type User = {
  id: number;
  ldap_username: string;
  display_name: string;
  email: string;
  department_id: number | null;
  roles: { role_type: string; section: string | null }[];
  approver_id: number | null;
};

const AuthContext = createContext<{
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  isAdmin: boolean;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    const t = typeof window !== "undefined" ? localStorage.getItem("helpdesk_token") : null;
    if (!t) {
      setToken(null);
      setUser(null);
      return;
    }
    setToken(t);
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      localStorage.removeItem("helpdesk_token");
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    localStorage.setItem("helpdesk_token", res.access_token);
    setToken(res.access_token);
    await loadUser();
  }, [loadUser]);

  const logout = useCallback(() => {
    localStorage.removeItem("helpdesk_token");
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin = !!user?.roles?.some((r) => r.role_type === "global_admin");

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loadUser, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
