import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/auth";
import { BackButton } from "@/components/BackButton";
import { BusyButton } from "@/components/BusyButton";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Admin Login | Big Pee Kicks" },
      { name: "description", content: "Admin access to inventory management." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { isAdmin, login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isAdmin) return <Navigate to="/admin" />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (await login(password)) {
        navigate({ to: "/admin" });
      } else {
        setError("Invalid password. Try again.");
        setPassword("");
      }
    } catch {
      setError("Could not reach the admin service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm border border-border bg-surface p-8 rounded-xl">
        <BackButton homeOnly />
        <div className="mb-8 flex justify-center">
          <Lock className="size-8 text-primary" />
        </div>

        <h1 className="text-center font-display text-2xl">Admin Access</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter the password to manage inventory.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="relative"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" disabled={loading} className="w-full rounded-md border border-border bg-background px-4 py-3 pr-11 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50" autoFocus /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <BusyButton type="submit" busy={loading} className="ember-fill inline-flex w-full items-center justify-center gap-2 rounded-md py-3 font-display text-sm tracking-widest transition-all hover:scale-[1.01] disabled:opacity-50">
            {loading ? "Checking..." : "Enter"}
          </BusyButton>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <span className="block">Use the configured admin password.</span>
        </p>
      </div>
    </div>
  );
}
