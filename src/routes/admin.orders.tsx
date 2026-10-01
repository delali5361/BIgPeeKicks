import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, Package, Truck } from "lucide-react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminGuard } from "@/components/AdminGuard";
import { useAuth } from "@/context/auth";
import { useOrders, type OrderStatus } from "@/context/orders";
import { formatPrice } from "@/lib/currency";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrdersPage });

function AdminOrdersPage() {
  const { isAdmin } = useAuth();
  const { orders, updateOrder, reloadOrders } = useOrders();
  const [updatingOrder, setUpdatingOrder] = useState("");
  const changeStatus = async (id: string, status: OrderStatus) => {
    setUpdatingOrder(id);
    try { await updateOrder(id, { status }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update order"); }
    finally { setUpdatingOrder(""); }
  };
  useEffect(() => { if (isAdmin) void reloadOrders().catch(() => undefined); }, [isAdmin, reloadOrders]);
  if (!isAdmin) return <AdminGuard />;
  return <div className="min-h-screen bg-background"><AdminSidebar /><main className="lg:ml-64"><div className="mx-auto max-w-6xl px-5 pb-20 pt-8"><Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> Inventory</Link><div className="mt-8 border-b border-border pb-8"><p className="text-xs uppercase tracking-[0.25em] text-primary">Admin / Fulfillment</p><h1 className="mt-3 text-5xl leading-none">Orders</h1><p className="mt-4 text-muted-foreground">Review buyer orders, payment state, and fulfillment progress.</p></div>{orders.length === 0 ? <p className="py-16 text-muted-foreground">No buyer orders yet.</p> : <div className="mt-8 space-y-4">{orders.map((order) => <article key={order.id} className="border border-border bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-display">{order.id}</p><p className="mt-1 text-xs text-muted-foreground">{order.delivery.name} · {order.delivery.email} · {new Date(order.placedAt).toLocaleDateString()}</p></div><p className="font-display text-xl text-primary">{formatPrice(order.total)}</p></div><div className="mt-5 grid gap-3 border-y border-border py-4 text-sm sm:grid-cols-3"><p className="flex gap-2 text-muted-foreground"><Package className="size-4 text-primary" /> {order.lines.length} item(s)</p><p className="flex gap-2 text-muted-foreground"><Truck className="size-4 text-primary" /> {order.delivery.city}, {order.delivery.country}</p><p className="text-muted-foreground">Payment: <span className="text-foreground">{order.paymentStatus}</span></p></div><div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-xs text-muted-foreground">Fulfillment <select disabled={updatingOrder === order.id} value={order.status} onChange={(event) => void changeStatus(order.id, event.target.value as OrderStatus)} className="ml-2 rounded border border-border bg-background px-2 py-1 text-foreground disabled:opacity-50"><option>Processing</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option></select></label>{updatingOrder === order.id && <LoaderCircle className="size-4 animate-spin text-primary" aria-label="Updating order" />}</div></article>)}</div>}</div></main></div>;
}
