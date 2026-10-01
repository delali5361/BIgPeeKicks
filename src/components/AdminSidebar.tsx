import { Link } from "@tanstack/react-router";
import { Bell, LoaderCircle, Package, LogOut, Menu, X, ShoppingCart, CreditCard, Users, RotateCcw, LayoutDashboard, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth";
import { BackButton } from "@/components/BackButton";
import { toast } from "sonner";
import logo from "../../logo/logo.png";

const navItems = [
  { label: "Dashboard", to: "/admin/dashboard" as const, icon: LayoutDashboard },
  { label: "Inventory", to: "/admin" as const, icon: Package },
  { label: "Orders", to: "/admin/orders" as const, icon: ShoppingCart },
  { label: "Payments", to: "/admin/payments" as const, icon: CreditCard },
  { label: "Customers", to: "/admin/customers" as const, icon: Users },
  { label: "Returns", to: "/admin/returns" as const, icon: RotateCcw },
  { label: "Settings", to: "/admin/settings" as const, icon: Settings },
];

export function AdminSidebar() {
  const { adminName, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; message: string; read_at: string | null; created_at: string }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => { void fetch("/api/admin/notifications").then((response) => response.ok ? response.json() as Promise<typeof notifications> : Promise.reject()).then(setNotifications).catch(() => undefined); }, []);
  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); }
    catch { toast.error("We couldn't log out. Please try again or contact the store administrator."); }
    finally { setLoggingOut(false); }
  };

  return (
    <>
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-surface transition-transform lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-6">
            <div className="flex items-center gap-3">
              <BackButton />
              <Link to="/" className="font-display text-lg leading-none">
                <img src={logo} alt="Big Pee Kicks" className="h-10 w-auto object-contain" />
              </Link>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close sidebar"
            >
              <X className="size-4" />
            </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5">
            <div className="relative mb-3"><button type="button" onClick={() => { setShowNotifications((value) => !value); if (notifications.some((notification) => !notification.read_at)) { void fetch("/api/admin/notifications/read", { method: "POST" }).then(() => setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? new Date().toISOString() })))); } }} className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm font-display text-muted-foreground hover:text-foreground" aria-label="Open notifications"><Bell className="size-4" /> Notifications {notifications.filter((notification) => !notification.read_at).length > 0 && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">{notifications.filter((notification) => !notification.read_at).length}</span>}</button>{showNotifications && <div className="absolute left-3 right-3 top-12 z-10 max-h-64 overflow-y-auto border border-border bg-background p-3 shadow-deep">{notifications.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No notifications yet.</p> : notifications.map((notification) => <div key={notification.id} className={`border-b border-border px-2 py-3 last:border-0 ${notification.read_at ? "opacity-60" : ""}`}><div className="flex items-center justify-between gap-2"><p className="text-xs font-display">{notification.title}</p>{!notification.read_at && <span className="text-[10px] text-primary">New</span>}</div><p className="mt-1 text-xs text-muted-foreground">{notification.message}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</p></div>)}</div>}</div>
            {navItems.map(({ label, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/admin" }}
                onClick={() => setIsOpen(false)}
                activeProps={{ className: "ember-fill" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                className="flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-display transition-colors"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="space-y-3 border-t border-border px-3 py-5">
            <p className="text-xs text-muted-foreground">
              Logged in as <span className="text-foreground font-display">{adminName}</span>
            </p>
            <button
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-xs font-display tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {loggingOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-5 top-20 z-40 flex items-center justify-center rounded-full border border-border bg-surface p-3 shadow-deep lg:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="size-5 text-primary" />
      </button>

      <div
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!isOpen}
      />
    </>
  );
}
