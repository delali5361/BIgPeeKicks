import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, RotateCcw } from "lucide-react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/context/auth";
import { useOrders } from "@/context/orders";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/returns")({ component: AdminReturnsPage });
function AdminReturnsPage() {
  const { isAdmin } = useAuth();
  const { orders, updateOrder, reloadOrders } = useOrders();
  const [updatingOrder, setUpdatingOrder] = useState("");
  useEffect(() => { if (isAdmin) void reloadOrders().catch(() => undefined); }, [isAdmin, reloadOrders]);
  const decide = async (id: string, returnStatus: "Approved" | "Rejected") => {
    setUpdatingOrder(id);
    try { await updateOrder(id, { returnStatus }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update return"); }
    finally { setUpdatingOrder(""); }
  };
  const returns = orders.filter((order) => order.returnStatus);
  if (!isAdmin) return <AdminGuard />;
  return <div className="min-h-screen bg-background"><AdminSidebar /><main className="lg:ml-64"><div className="mx-auto max-w-6xl px-5 pb-20 pt-8"><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Inventory</Link><div className="mt-8 border-b border-border pb-8"><p className="text-xs uppercase tracking-[0.25em] text-primary">Admin / Support</p><h1 className="mt-3 text-5xl leading-none">Returns</h1><p className="mt-4 text-muted-foreground">Review buyer return and exchange requests.</p></div>{returns.length === 0 ? <p className="py-16 text-muted-foreground">No return requests yet.</p> : <div className="mt-8 space-y-4">{returns.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-4 border border-border bg-surface p-5"><div><p className="flex items-center gap-2 font-display"><RotateCcw className="size-4 text-primary" />{order.id}</p><p className="mt-2 text-sm text-muted-foreground">{order.delivery.name} · {order.delivery.email}</p><p className="mt-1 text-xs text-muted-foreground">Reason: {order.returnReason ?? "Not provided"}</p></div><span className="text-sm text-primary">{order.returnStatus}</span><div className="flex items-center gap-2"><button onClick={() => void decide(order.id, "Approved")} disabled={Boolean(updatingOrder) || order.returnStatus === "Approved"} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50">{updatingOrder === order.id && <LoaderCircle className="size-3.5 animate-spin" />}Approve</button><button onClick={() => void decide(order.id, "Rejected")} disabled={Boolean(updatingOrder) || order.returnStatus === "Rejected"} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:border-red-400 hover:text-red-400 disabled:opacity-50">{updatingOrder === order.id && <LoaderCircle className="size-3.5 animate-spin" />}Reject</button></div></div>)}</div>}</div></main></div>;
}
