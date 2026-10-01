import type { CatalogDatabase } from "@/lib/catalog.server";
import { createNotification, getAdminPhone, sendArkeselSms } from "@/lib/notifications.server";
import type { ShippingMethod } from "@/lib/shipping.server";
import { toPesewas } from "@/lib/currency";

export type PendingOrderInput = {
  email: string;
  phone?: string;
  recipient?: { name: string; phone: string; address: string; city: string; country: string };
  name: string;
  address: string;
  city: string;
  country: string;
  recipient?: { name: string; phone: string; address: string; city: string; country: string };
  deliverToRecipient?: boolean;
  method: ShippingMethod;
  promoCode?: string;
  lines: Array<{ productId: string; size: number; quantity: number }>;
};

export async function createPendingOrder(database: CatalogDatabase, input: PendingOrderInput) {
  if (!input.email.trim() || !input.name.trim() || !input.address.trim() || !input.city.trim()) throw new Error("Contact and delivery details are required");
  if (!input.lines.length || input.lines.length > 50) throw new Error("The cart must contain between 1 and 50 product lines");
  const requested = new Map<string, { productId: string; size: number; quantity: number }>();
  for (const line of input.lines) {
    if (!line.productId || !Number.isInteger(line.size) || !Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("Cart contains an invalid product, size, or quantity");
    const key = `${line.productId}:${line.size}`;
    const existing = requested.get(key);
    requested.set(key, { ...line, quantity: line.quantity + (existing?.quantity ?? 0) });
  }
  const orderInput = {
    ...input,
    shippingCity: input.deliverToRecipient ? input.recipient?.city ?? input.city : input.city,
  };
  const result = await database.prepare("SELECT public.create_pending_order(?::jsonb, ?::jsonb) AS order_result")
    .bind(JSON.stringify(orderInput), JSON.stringify([...requested.values()]))
    .all<{ order_result: { orderId: string; subtotal: number; shipping: number; discount: number; total: number; reservationExpiresAt: string } }>();
  const order = result.results[0]?.order_result;
  if (!order?.orderId) throw new Error("Unable to create inventory reservation");
  await createNotification(database, "New order awaiting payment", `Order ${order.orderId} was placed by ${input.name}. Amount due: GHS ${order.total.toFixed(2)}. Delivery: ${input.city}, ${input.country}. Payment is still pending.`, order.orderId);
  return order;
}

export async function markOrderPaid(database: CatalogDatabase, reference: string, amount: number, currency: string): Promise<void> {
  const order = await database.prepare("SELECT id, payment_status, delivery_name, delivery_email, delivery_phone, recipient_phone, total FROM orders WHERE payment_reference = ?").bind(reference).all<{ id: string; payment_status: string; delivery_name: string; delivery_email: string; delivery_phone: string | null; recipient_phone: string | null; total: number }>();
  if (!order.results[0]) throw new Error("Payment reference does not match an order");
  if (amount !== toPesewas(order.results[0].total) || currency !== "GHS") throw new Error("Verified payment amount does not match the order total");
  if (order.results[0].payment_status !== "Pending") return;
  const settlement = await database.prepare("SELECT public.settle_order_payment(?, ?, ?) AS settlement_result")
    .bind(reference, amount, currency)
    .all<{ settlement_result: { changed: boolean; orderId: string; late: boolean; stockAvailable: boolean } }>();
  const result = settlement.results[0]?.settlement_result;
  if (!result?.changed) return;
  const adminMessage = result.stockAvailable
    ? `Payment confirmed for order ${order.results[0].id}. Buyer: ${order.results[0].delivery_name}. Amount paid: GHS ${order.results[0].total.toFixed(2)}. Reserved stock is ready for processing.`
    : `Payment confirmed for order ${order.results[0].id}, but the expired stock reservation could not be reacquired. Review fulfillment and contact the buyer about a replacement or refund.`;
  await createNotification(database, result.stockAvailable ? "Payment confirmed" : "Paid order needs stock review", adminMessage, order.results[0].id, result.stockAvailable ? "order" : "payment");
  const buyerMessage = result.stockAvailable
    ? `Big Pee Kicks: payment confirmed for order ${order.results[0].id}. Amount paid: GHS ${order.results[0].total.toFixed(2)}. We will prepare your delivery.`
    : `Big Pee Kicks: payment received for order ${order.results[0].id}. We are confirming stock and will contact you shortly with an update.`;
  const adminSms = result.stockAvailable
    ? `Big Pee Kicks admin: payment confirmed. Order ${order.results[0].id}, buyer ${order.results[0].delivery_name}, amount GHS ${order.results[0].total.toFixed(2)}. Please process the order.`
    : `Big Pee Kicks admin: urgent stock review. Order ${order.results[0].id} was paid after its reservation expired and stock could not be reclaimed. Contact the buyer to arrange fulfillment or refund.`;
  await sendArkeselSms([order.results[0].delivery_phone ?? "", order.results[0].recipient_phone ?? ""], buyerMessage).catch((error) => console.error(error));
  await sendArkeselSms([await getAdminPhone(database)], adminSms).catch((error) => console.error(error));
}

export async function attachPaymentReference(database: CatalogDatabase, orderId: string, reference: string): Promise<void> {
  await database.prepare("UPDATE orders SET payment_reference = ? WHERE id = ? AND payment_status = 'Pending'").bind(reference, orderId).run();
}

export async function listOrders(database: CatalogDatabase, customerId?: string, email?: string) {
  const filter = customerId ? "o.customer_id = ?" : email ? "LOWER(c.email) = LOWER(?)" : "1 = 1";
  const value = customerId ?? email;
  const orders = await database.prepare(`SELECT o.id, o.status, o.payment_status, o.payment_reference, o.total, o.shipping, o.delivery_email, o.delivery_name, o.delivery_address, o.delivery_city, o.delivery_country, o.delivery_phone, o.recipient_name, o.recipient_phone, o.recipient_address, o.recipient_city, o.recipient_country, o.placed_at, o.estimated_delivery, r.status AS return_status, r.reason AS return_reason FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN returns r ON r.order_id = o.id WHERE ${filter} ORDER BY o.placed_at DESC`).bind(...(value ? [value] : [])).all<{ id: string; status: string; payment_status: string; payment_reference: string | null; total: number; shipping: number; delivery_email: string; delivery_name: string; delivery_address: string; delivery_city: string; delivery_country: string; delivery_phone: string | null; recipient_name: string | null; recipient_phone: string | null; recipient_address: string | null; recipient_city: string | null; recipient_country: string | null; placed_at: string; estimated_delivery: string; return_status: "Requested" | "Approved" | "Rejected" | null; return_reason: string | null }>();
  const items = await database.prepare("SELECT order_id, product_id, product_name, size, quantity, unit_price FROM order_items").bind().all<{ order_id: string; product_id: string; product_name: string; size: number; quantity: number; unit_price: number }>();
  return orders.results.map((order) => ({
    id: order.id,
    lines: items.results.filter((item) => item.order_id === order.id).map((item) => ({ product: { id: item.product_id, name: item.product_name, price: item.unit_price, image: "", category: "Shoes", tag: "", sizes: [item.size], description: "", popularity: 0, createdAt: "" }, size: item.size, qty: item.quantity })),
    total: order.total,
    shipping: order.shipping,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentReference: order.payment_reference ?? undefined,
    placedAt: order.placed_at,
    estimatedDelivery: order.estimated_delivery,
    delivery: { email: order.delivery_email, name: order.recipient_name ?? order.delivery_name, address: order.recipient_address ?? order.delivery_address, city: order.recipient_city ?? order.delivery_city, country: order.recipient_country ?? order.delivery_country },
    returnStatus: order.return_status ?? undefined,
    returnReason: order.return_reason ?? undefined,
  }));
}

export async function requestOrderReturn(database: CatalogDatabase, orderId: string, email?: string, reason = "Buyer requested a return") {
  const order = await database.prepare(`SELECT o.id, o.delivery_name, o.total FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ? ${email ? "AND LOWER(c.email) = LOWER(?)" : ""}`).bind(...(email ? [orderId, email] : [orderId])).all<{ id: string; delivery_name: string; total: number }>();
  if (!order.results[0]) throw new Error("Order not found");
  const existing = await database.prepare("SELECT id FROM returns WHERE order_id = ?").bind(orderId).all<{ id: number }>();
  if (!existing.results[0]) {
    await database.prepare("INSERT INTO returns (order_id, reason, status, created_at) VALUES (?, ?, 'Requested', ?)").bind(orderId, reason, new Date().toISOString()).run();
    await createNotification(database, "Return request received", `Buyer ${order.results[0].delivery_name} requested a return for order ${orderId}. Order amount: GHS ${order.results[0].total.toFixed(2)}. Reason: ${reason}. Admin review is required.`, orderId);
  }
}

export async function updateReturnStatus(database: CatalogDatabase, orderId: string, status: string): Promise<void> {
  if (!["Requested", "Approved", "Rejected"].includes(status)) throw new Error("Invalid return status");
  const order = await database.prepare("SELECT delivery_name, delivery_phone, recipient_phone FROM orders WHERE id = ?").bind(orderId).all<{ delivery_name: string; delivery_phone: string | null; recipient_phone: string | null }>();
  if (!order.results[0]) throw new Error("Order not found");
  await database.prepare("UPDATE returns SET status = ? WHERE order_id = ?").bind(status, orderId).run();
  await createNotification(database, `Return ${status.toLowerCase()}`, `Return decision for order ${orderId}: ${status}. Buyer: ${order.results[0].delivery_name}. The buyer has been notified by SMS.`, orderId);
  await sendArkeselSms([order.results[0].delivery_phone ?? "", order.results[0].recipient_phone ?? ""], `Big Pee Kicks: your return request for order ${orderId} was ${status.toLowerCase()}. Please check your account for the next steps.`).catch((error) => console.error(error));
}

export async function updateOrderStatus(database: CatalogDatabase, orderId: string, status: string): Promise<void> {
  if (!["Processing", "Shipped", "Delivered", "Cancelled"].includes(status)) throw new Error("Invalid order status");
  const order = await database.prepare("SELECT delivery_name, delivery_phone, recipient_phone FROM orders WHERE id = ?").bind(orderId).all<{ delivery_name: string; delivery_phone: string | null; recipient_phone: string | null }>();
  if (!order.results[0]) throw new Error("Order not found");
  await database.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, orderId).run();
  if (status === "Shipped") {
    await createNotification(database, "Order shipped", `Order ${orderId} for ${order.results[0].delivery_name} was marked as shipped. The buyer has been notified by SMS.`, orderId);
    await sendArkeselSms([order.results[0].delivery_phone ?? "", order.results[0].recipient_phone ?? ""], `Big Pee Kicks: order ${orderId} has shipped. Please keep your phone available for delivery updates.`).catch((error) => console.error(error));
    await sendArkeselSms([await getAdminPhone(database)], `Big Pee Kicks admin: order ${orderId} for ${order.results[0].delivery_name} was marked as shipped successfully.`).catch((error) => console.error(error));
  }
}

export async function releaseOrderReservation(database: CatalogDatabase, orderId: string): Promise<void> {
  await database.prepare("SELECT public.release_order_stock_reservation(?) AS released_count").bind(orderId).all<{ released_count: number }>();
}

export async function releaseExpiredReservations(database: CatalogDatabase): Promise<void> {
  await database.prepare("SELECT public.release_expired_stock_reservations() AS released_count").bind().all<{ released_count: number }>();
}