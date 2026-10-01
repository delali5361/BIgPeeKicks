import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, LoaderCircle, Package, RotateCcw, Truck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useOrders } from "@/context/orders";
import { useAuth } from "@/context/auth";
import { formatPrice } from "@/lib/currency";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/user-error";

export const Route = createFileRoute("/account")({ component: AccountPage });

function AccountPage() {
  const { orders, requestReturn, reloadOrders } = useOrders();
  const { buyer } = useAuth();
  const [requestingReturn, setRequestingReturn] = useState("");
  const buyerOrders = buyer ? orders : [];
  useEffect(() => {
    if (buyer) void reloadOrders().catch(() => undefined);
  }, [buyer, reloadOrders]);
  const submitReturn = async (id: string) => {
    setRequestingReturn(id);
    try { await requestReturn(id); }
    catch (error) { toast.error(userFacingError(error, "We couldn't submit your return request. Please contact the store administrator.")); }
    finally { setRequestingReturn(""); }
  };
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 pb-20 pt-32">
        <p className="text-xs uppercase tracking-[0.25em] text-primary">
          {buyer ? `Welcome, ${buyer.name}` : "Buyer account"}
        </p>
        <h1 className="mt-3 text-5xl leading-none sm:text-6xl">Order history</h1>
        {!buyer ? (
          <div className="mt-10 border-y border-border py-12">
            <p className="text-muted-foreground">
              Sign in to see your orders, track delivery, and request returns.
            </p>
            <Link
              to="/buyer-login"
              className="ember-fill mt-6 inline-block rounded-md px-5 py-3 font-display text-xs tracking-widest"
            >
              Sign in / register
            </Link>
          </div>
        ) : buyerOrders.length === 0 ? (
          <div className="mt-10 border-y border-border py-12">
            <p className="text-muted-foreground">
              Your order history will appear here after checkout.
            </p>
            <Link
              to="/shop"
              className="ember-fill mt-6 inline-block rounded-md px-5 py-3 font-display text-xs tracking-widest"
            >
              Shop the shelf
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-5">
            {buyerOrders.map((order) => (
              <article key={order.id} className="border border-border bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display">{order.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Placed {new Date(order.placedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="text-sm text-primary">{order.status}</span>
                </div>
                <div className="mt-5 grid gap-3 border-y border-border py-4 text-sm sm:grid-cols-3">
                  <p className="flex gap-2 text-muted-foreground">
                    <Package className="size-4 text-primary" /> {order.lines.length} item(s)
                  </p>
                  <p className="flex gap-2 text-muted-foreground">
                    <Truck className="size-4 text-primary" /> Arrives{" "}
                    {new Date(order.estimatedDelivery).toLocaleDateString()}
                  </p>
                  <p className="font-display text-primary">{formatPrice(order.total)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {order.paymentStatus === "Paid" && order.paymentReference && (
                    <a href={`/api/orders/${order.id}/receipt?reference=${encodeURIComponent(order.paymentReference)}`} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                      <Download className="size-4" /> Download receipt
                    </a>
                  )}
                  <button
                    disabled={Boolean(order.returnStatus) || Boolean(requestingReturn)}
                    onClick={() => void submitReturn(order.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {requestingReturn === order.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{" "}
                    {requestingReturn === order.id ? "Submitting..." : order.returnStatus ?? "Request return / exchange"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
