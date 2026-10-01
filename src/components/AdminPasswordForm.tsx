import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { BusyButton } from "@/components/BusyButton";
import { toast } from "sonner";

export function AdminPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/admin/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) throw new Error("Password change failed.");
      setMessage("Password updated. Please sign in again.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password change failed.");
      toast.error("Password could not be changed");
    } finally {
      setSaving(false);
    }
  };
  return <section className="border border-border bg-surface p-5 sm:p-6"><h2 className="flex items-center gap-2 font-display text-lg"><LockKeyhole className="size-4 text-primary" /> Admin password</h2><form onSubmit={submit} className="mt-5 space-y-3"><div className="relative"><input required disabled={saving} type={show ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" className="w-full rounded-md border border-border bg-background px-4 py-3 pr-11 text-sm" /><button type="button" disabled={saving} onClick={() => setShow((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 disabled:opacity-50" aria-label="Toggle password visibility">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><input required disabled={saving} minLength={10} type={show ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (10+ characters)" className="w-full rounded-md border border-border bg-background px-4 py-3 text-sm" /><BusyButton type="submit" busy={saving} className="ember-fill inline-flex items-center gap-2 rounded-md px-4 py-2 font-display text-xs tracking-widest disabled:opacity-50">{saving ? "Updating password..." : "Update password"}</BusyButton>{message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}</form></section>;
}
