import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, LockKeyhole, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useCart } from "@/context/cart";
import { useAuth } from "@/context/auth";
import { formatPrice } from "@/lib/currency";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | Big Pee Kicks" },
      { name: "description", content: "Complete your Big Pee Kicks order." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { lines, clearCart } = useCart();
  const { buyer } = useAuth();
  const navigate = useNavigate();
  const [reviewing, setReviewing] = useState(false);
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [promo, setPromo] = useState("");
  const [promoError, setPromoError] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentError, setPaymentError] = useState("");
  const [paymentStage, setPaymentStage] = useState<"starting" | "waiting" | "verifying" | null>(null);
  const [deliverToSomeoneElse, setDeliverToSomeoneElse] = useState(false);
  const [city, setCity] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [shippingRate, setShippingRate] = useState(0);
  const [freeDeliveryApplied, setFreeDeliveryApplied] = useState(false);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(200);
  const [quotedFor, setQuotedFor] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const quoteRequest = useRef(0);
  const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const quoteCity = deliverToSomeoneElse ? recipientCity : city;
  const quoteKey = JSON.stringify([quoteCity.trim().toLowerCase(), shippingMethod, subtotal, promo.trim().toUpperCase()]);
  const quoteReady = Boolean(quoteCity.trim()) && quotedFor === quoteKey;
  const shipping = quoteReady ? (freeDeliveryApplied ? 0 : shippingRate) : null;
  const shippingLabel = quoteLoading ? "Calculating..." : quoteError ? "Unavailable" : !quoteCity.trim() ? "Enter delivery city" : !quoteReady ? "Calculating..." : shipping === 0 ? "Free" : formatPrice(shippingRate);
  const total = Math.max(0, subtotal + (shipping ?? 0) - discount);

  useEffect(() => {
    const requestId = ++quoteRequest.current;
    if (!quoteCity.trim() || !lines.length) {
      setQuotedFor("");
      setQuoteLoading(false);
      return;
    }
    const requestKey = JSON.stringify([quoteCity.trim().toLowerCase(), shippingMethod, subtotal, promo.trim().toUpperCase()]);
    setQuoteLoading(true);
    setQuoteError("");
    const timer = window.setTimeout(() => {
      void fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city: quoteCity.trim(), method: shippingMethod, subtotal, promoCode: promo.trim() }),
      }).then(async (response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(error?.error ?? `Delivery fee request failed (${response.status})`);
        }
        return await response.json() as { shipping: number; discount: number; promoValid: boolean; freeDeliveryApplied: boolean; freeDeliveryThreshold?: number };
      }).then((quote) => {
        if (requestId !== quoteRequest.current) return;
        setShippingRate(quote.shipping);
        setFreeDeliveryApplied(quote.freeDeliveryApplied);
        setDiscount(quote.discount);
        setPromoError(promo.trim() && !quote.promoValid ? "That code is not active." : "");
        if (typeof quote.freeDeliveryThreshold === "number") setFreeDeliveryThreshold(quote.freeDeliveryThreshold);
        setQuotedFor(requestKey);
      }).catch((error: unknown) => {
        if (requestId === quoteRequest.current) {
          setQuotedFor("");
          setQuoteError(error instanceof Error ? error.message : "Delivery fee could not be updated yet.");
        }
      }).finally(() => {
        if (requestId === quoteRequest.current) setQuoteLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [quoteCity, lines.length, promo, shippingMethod, subtotal]);

  useEffect(() => {
    if (document.querySelector("script[data-paystack-inline]")) return;
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.dataset["paystackInline"] = "true";
    document.body.appendChild(script);
  }, []);

  const handleCheckout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!reviewing) {
      setCity(String(form.get("city")));
      setReviewing(true);
      return;
    }
    setPaymentStage("starting");
    setPaymentError("");
    try {
      const response = await fetch("/api/payments/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email")),
          phone: String(form.get("phone") ?? ""),
          name: `${String(form.get("firstName"))} ${String(form.get("lastName"))}`,
          address: String(form.get("address")),
          city: String(form.get("city")),
          country: "Ghana",
          deliverToRecipient: deliverToSomeoneElse,
          method: shippingMethod,
          promoCode: promo.trim(),
          lines: lines.map((line) => ({ productId: line.product.id, size: line.size, quantity: line.qty })),
          recipient: deliverToSomeoneElse ? { name: String(form.get("recipientName")), phone: String(form.get("recipientPhone")), address: String(form.get("recipientAddress")), city: String(form.get("recipientCity")), country: "Ghana" } : undefined,
        }),
      });
      const responseText = await response.text();
      let payment: { reference?: string; orderId?: string; total?: number; error?: string };
      try { payment = JSON.parse(responseText) as typeof payment; } catch { throw new Error(responseText.startsWith("<!doctype") ? "Payment server error. Check the terminal for details." : "Invalid payment server response"); }
      if (!response.ok || !payment.reference || !payment.orderId || typeof payment.total !== "number")
        throw new Error(payment.error ?? "Unable to start payment");
      const publicKey = import.meta.env["VITE_PAYSTACK_PUBLIC_KEY"] as string | undefined;
      const paystack = (window as Window & { PaystackPop?: new () => { newTransaction: (options: Record<string, unknown>) => void } }).PaystackPop;
      if (!publicKey || !paystack) throw new Error("Paystack popup is not configured");
      setPaymentStage("waiting");
      new paystack().newTransaction({ key: publicKey, email: String(form.get("email")), amount: Math.round(payment.total * 100), currency: "GHS", ref: payment.reference, onSuccess: async (result: { reference: string }) => { setPaymentStage("verifying"); const verification = await fetch("/api/payments/paystack/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference: result.reference }) }); if (!verification.ok) throw new Error("Payment could not be verified"); clearCart(); window.location.assign(`/order-confirmation?orderId=${encodeURIComponent(payment.orderId!)}&reference=${encodeURIComponent(result.reference)}`); }, onCancel: () => setPaymentStage(null) });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to start payment");
      setPaymentStage(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-32">
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-4" />
          Continue shopping
        </Link>

        <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_380px]">
          <section>
            <div className="mb-8">
              <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-primary">
                Secure checkout
              </p>
              <h1 className="text-5xl leading-none sm:text-6xl">Finish the fit</h1>
            </div>

            {lines.length === 0 ? (
              <div className="border-y border-border py-12">
                <p className="text-muted-foreground">
                  Your bag is empty. Find a pair before checking out.
                </p>
                <Link
                  to="/shop"
                  className="ember-fill mt-6 inline-block rounded-md px-6 py-3 font-display text-xs tracking-widest"
                >
                  Browse the shelf
                </Link>
              </div>
            ) : (
              <>
                {!buyer && !reviewing && (
                  <div className="mb-8 border border-primary/30 bg-surface p-5">
                    <p className="font-display text-sm">Want order tracking?</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sign in for order history, saved details, and easy returns. Guest checkout is
                      still available.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        to="/buyer-login"
                        className="ember-fill rounded-md px-4 py-2 text-xs font-display tracking-widest"
                      >
                        Sign in / register
                      </Link>
                      <span className="flex items-center text-xs text-muted-foreground">
                        or continue below as guest
                      </span>
                    </div>
                  </div>
                )}
                <form onSubmit={handleCheckout} className="space-y-8">
                  <fieldset className="space-y-4">
                    <legend className="font-display text-lg">Contact</legend>
                    <input
                      name="email"
                      required
                      defaultValue={buyer?.email ?? ""}
                      type="email"
                      placeholder="Email address"
                      className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                    />
                    <input
                      name="phone"
                      required
                      type="tel"
                      placeholder="Phone number, e.g. 0241234567"
                      className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                    />
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="font-display text-lg">Delivery details</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        name="firstName"
                        required
                        placeholder="First name"
                        className="rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                      />
                      <input
                        name="lastName"
                        required
                        placeholder="Last name"
                        className="rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                      />
                    </div>
                    <input
                      name="address"
                      required
                      placeholder="Address"
                      className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        name="city"
                        required
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="City"
                        className="rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                      />
                      <input value="Ghana" readOnly className="rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground" />
                    </div>
                    <label className="flex items-center gap-3 text-sm text-muted-foreground"><input type="checkbox" checked={deliverToSomeoneElse} onChange={(event) => setDeliverToSomeoneElse(event.target.checked)} /> Deliver to someone else</label>
                    {deliverToSomeoneElse && <div className="space-y-4 border-l-2 border-primary/40 pl-4"><p className="font-display text-sm">Recipient details</p><input name="recipientName" required placeholder="Recipient full name" className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm" /><input name="recipientPhone" required type="tel" placeholder="Recipient phone number" className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm" /><input name="recipientAddress" required placeholder="Recipient address" className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm" /><input name="recipientCity" required value={recipientCity} onChange={(event) => setRecipientCity(event.target.value)} placeholder="Recipient city" className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm" /><p className="text-xs text-muted-foreground">Delivery country: Ghana</p></div>}
                  </fieldset>

                  <fieldset className="space-y-3">
                    <legend className="font-display text-lg">Shipping method</legend>
                    <label className="flex cursor-pointer items-center justify-between border border-border bg-surface p-4 text-sm">
                      <span>
                        <input
                          type="radio"
                          name="shipping"
                          checked={shippingMethod === "standard"}
                          onChange={() => setShippingMethod("standard")}
                          className="mr-3 accent-[var(--primary)]"
                        />
                        Standard delivery
                      </span>
                      <span className="text-muted-foreground">
                        {shippingLabel}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center justify-between border border-border bg-surface p-4 text-sm">
                      <span>
                        <input
                          type="radio"
                          name="shipping"
                          checked={shippingMethod === "express"}
                          onChange={() => setShippingMethod("express")}
                          className="mr-3 accent-[var(--primary)]"
                        />
                        Express delivery
                      </span>
                      <span className="text-muted-foreground">{shippingLabel}</span>
                    </label>
                  </fieldset>
                  {(quoteLoading || quoteError) && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                      {quoteLoading && <LoaderCircle className="size-3.5 animate-spin text-primary" />}
                      {quoteLoading ? "Updating delivery fee..." : quoteError}
                    </p>
                  )}

                  <div>
                    <label className="font-display text-sm">Promo code</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={promo}
                        onChange={(event) => setPromo(event.target.value)}
                        placeholder="Try BIGPEE10"
                        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
                      />
                      <span className="flex items-center px-2 text-sm text-primary">
                        {discount ? `-${formatPrice(discount)}` : ""}
                      </span>
                    </div>
                    {promoError && <p className="mt-2 text-sm text-red-400">{promoError}</p>}
                  </div>

                  {reviewing && (
                    <div className="border border-primary/40 bg-surface p-4 text-sm">
                      <p className="font-display">Review your order</p>
                      <p className="mt-2 text-muted-foreground">
                        {lines.length} item(s) ·{" "}
                        {shippingMethod === "express" ? "Express" : "Standard"} delivery ·{" "}
                        {formatPrice(total)} total
                      </p>
                    </div>
                  )}

                  {paymentError && (
                    <p className="text-sm text-red-400" role="alert">
                      {paymentError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={paymentStage !== null || (reviewing && (!quoteReady || quoteLoading || Boolean(promoError)))}
                    className="ember-fill w-full rounded-md py-4 font-display text-sm tracking-widest transition-transform hover:scale-[1.01] disabled:opacity-50"
                  >
                    {paymentStage !== null && <LoaderCircle className="mr-2 inline size-4 animate-spin" />}
                    {paymentStage === "starting"
                      ? "Opening secure payment..."
                      : paymentStage === "waiting"
                        ? "Complete payment in the Paystack window"
                        : paymentStage === "verifying"
                          ? "Confirming payment..."
                          : reviewing
                            ? `Pay ${formatPrice(total)}`
                            : quoteLoading
                              ? "Updating delivery fee..."
                              : "Review order"}
                  </button>
                </form>
              </>
            )}
          </section>

          <aside className="h-fit border border-border bg-surface p-6 lg:sticky lg:top-28">
            <h2 className="font-display text-lg">Order summary</h2>
            <div className="mt-6 space-y-4">
              {lines.map((line) => (
                <div key={`${line.product.id}-${line.size}`} className="flex gap-3">
                  <img
                    src={line.product.image}
                    alt={line.product.name}
                    className="size-16 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xs">{line.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      EU {line.size} · Qty {line.qty}
                    </p>
                  </div>
                  <span className="text-sm">{formatPrice(line.product.price * line.qty)}</span>
                </div>
              ))}
              {lines.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
            </div>
            <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{shipping === null ? shippingLabel : shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
              <div className="flex justify-between font-display text-lg">
                <span>Total</span>
                <span className="text-primary">{formatPrice(total)}</span>
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-border pt-5 text-xs text-muted-foreground">
              <p className="flex gap-2">
                <LockKeyhole className="size-4 shrink-0 text-primary" /> Secure payment processing
              </p>
              {freeDeliveryThreshold > 0 ? (
                <p className="flex gap-2">
                  <Truck className="size-4 shrink-0 text-primary" />
                  {freeDeliveryApplied
                    ? `Free delivery applied: order meets the ${formatPrice(freeDeliveryThreshold)} threshold`
                    : `Free delivery over ${formatPrice(freeDeliveryThreshold)}`}
                </p>
              ) : (
                <p className="flex gap-2"><Truck className="size-4 shrink-0 text-primary" />Delivery fee uses the selected location rate</p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
