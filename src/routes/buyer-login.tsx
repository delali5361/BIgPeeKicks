import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, UserRound } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/auth";
import { BackButton } from "@/components/BackButton";
import { BusyButton } from "@/components/BusyButton";

export const Route = createFileRoute("/buyer-login")({
  component: BuyerLoginPage,
});

function BuyerLoginPage() {
  const { buyer, buyerLogin, buyerRegister } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (buyer) {
    navigate({ to: "/account" });
    return null;
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const valid = mode === "signin" ? await buyerLogin(email, password) : await buyerRegister(name, email, password);
      if (!valid) {
        setError(mode === "signin" ? "Email or password is incorrect." : "An account with that email already exists.");
        return;
      }
      navigate({ to: "/account" });
    } catch {
      setError("Could not reach the account service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md border border-border bg-surface p-6 sm:p-8">
        <BackButton />
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Back to shop</Link>
        <div className="mt-8 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><UserRound className="size-6" /></div>
        <h1 className="mt-6 text-4xl leading-none">Your rotation</h1>
        <p className="mt-3 text-sm text-muted-foreground">Sign in to track orders and manage returns, or create an account in a few seconds.</p>
        <div className="mt-8 grid grid-cols-2 border-b border-border"><button disabled={submitting} onClick={() => { setMode("signin"); setError(""); }} className={`border-b-2 pb-3 text-sm disabled:opacity-50 ${mode === "signin" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Sign in</button><button disabled={submitting} onClick={() => { setMode("register"); setError(""); }} className={`border-b-2 pb-3 text-sm disabled:opacity-50 ${mode === "register" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>Create account</button></div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" && <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />}
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
          <div className="relative"><input required minLength={6} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (6+ characters)" className="w-full rounded-md border border-border bg-background px-4 py-3 pr-11 text-sm outline-none focus:border-primary" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <BusyButton type="submit" busy={submitting} className="ember-fill inline-flex w-full items-center justify-center gap-2 rounded-md py-3 font-display text-xs tracking-widest disabled:opacity-50">{submitting ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Sign in" : "Create account"}</BusyButton>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">You can still check out as a guest.</p>
      </div>
    </div>
  );
}
