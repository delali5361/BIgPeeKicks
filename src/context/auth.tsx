import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type AuthCtx = {
  isAdmin: boolean;
  adminName: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  buyer: { id: string; name: string; email: string } | null;
  buyerLogin: (email: string, password: string) => Promise<boolean>;
  buyerRegister: (name: string, email: string, password: string) => Promise<boolean>;
  buyerLogout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  const [adminName, setAdminName] = useState<string | null>(null);

  const [buyer, setBuyer] = useState<AuthCtx["buyer"]>(null);

  useEffect(() => {
    void fetch("/api/admin/session").then((response) => response.json() as Promise<{ isAdmin: boolean; name: string | null }>).then((session) => {
      setIsAdmin(session.isAdmin);
      setAdminName(session.name);
    }).catch(() => setIsAdmin(false));
    void fetch("/api/buyer/session").then((response) => response.ok ? response.json() as Promise<AuthCtx["buyer"]> : null).then(setBuyer).catch(() => setBuyer(null));
  }, []);

  const buyerLogin = async (email: string, password: string) => {
    const response = await fetch("/api/buyer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!response.ok) return false;
    setBuyer(await response.json() as AuthCtx["buyer"]);
    return true;
  };

  const buyerRegister = async (name: string, email: string, password: string) => {
    const response = await fetch("/api/buyer/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
    if (!response.ok) return false;
    setBuyer(await response.json() as AuthCtx["buyer"]);
    return true;
  };

  const buyerLogout = async () => {
    await fetch("/api/buyer/logout", { method: "POST" });
    setBuyer(null);
  };

  const login = async (password: string): Promise<boolean> => {
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) return false;
    const session = await response.json() as { name: string };
    setIsAdmin(true);
    setAdminName(session.name);
    return true;
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
    setAdminName(null);
  };

  return (
    <Ctx.Provider value={{ isAdmin, adminName, login, logout, buyer, buyerLogin, buyerRegister, buyerLogout }}>
      {children}
    </Ctx.Provider>
  );
}
