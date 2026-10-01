import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createProduct, deleteProduct, listActiveProducts, updateProduct } from "./lib/catalog.server";
import { getDatabase } from "./lib/database.server";
import { adminName, changeAdminPassword, isAdminRequest, loginAdmin, logoutAdmin } from "./lib/admin-auth.server";
import { initializePaystackPayment, verifyPaystackPayment } from "./lib/paystack.server";
import { attachPaymentReference, createPendingOrder, listOrders, markOrderPaid, releaseExpiredReservations, releaseOrderReservation, requestOrderReturn, updateOrderStatus, updateReturnStatus } from "./lib/orders.server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { deflateSync, inflateSync } from "node:zlib";
import { join, normalize } from "node:path";
import { createNotification, getAdminPhone, listNotifications, markNotificationsRead, sendArkeselSms } from "./lib/notifications.server";
import { storeProductImage } from "./lib/images.server";
import { getCartId, readCart, replaceCart } from "./lib/cart.server";
import { currentBuyer, loginBuyer, logoutBuyer, registerBuyer } from "./lib/buyer-auth.server";
import { quoteShipping } from "./lib/shipping.server";
import { toPesewas } from "./lib/currency";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function preparePngForPdf(png: Buffer) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25] ?? 2;
  let offset = 8;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const source = inflateSync(Buffer.concat(chunks));
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * rowLength);
  const paeth = (left: number, above: number, upperLeft: number) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  for (let row = 0; row < height; row += 1) {
    const filter = source[row * (rowLength + 1)] ?? 0;
    const start = row * (rowLength + 1) + 1;
    const previous = row === 0 ? undefined : pixels.subarray((row - 1) * rowLength, row * rowLength);
    const target = pixels.subarray(row * rowLength, (row + 1) * rowLength);
    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= bytesPerPixel ? target[index - bytesPerPixel] ?? 0 : 0;
      const above = previous?.[index] ?? 0;
      const upperLeft = index >= bytesPerPixel ? previous?.[index - bytesPerPixel] ?? 0 : 0;
      const value = source[start + index] ?? 0;
      target[index] = filter === 0 ? value : filter === 1 ? (value + left) & 255 : filter === 2 ? (value + above) & 255 : filter === 3 ? (value + Math.floor((left + above) / 2)) & 255 : (value + paeth(left, above, upperLeft)) & 255;
    }
  }
  const rgb = Buffer.alloc(height * (width * 3 + 1));
  for (let row = 0; row < height; row += 1) {
    rgb[row * (width * 3 + 1)] = 0;
    for (let column = 0; column < width; column += 1) {
      const sourceIndex = row * rowLength + column * bytesPerPixel;
      const targetIndex = row * (width * 3 + 1) + 1 + column * 3;
      rgb[targetIndex] = pixels[sourceIndex] ?? 0;
      rgb[targetIndex + 1] = pixels[sourceIndex + 1] ?? 0;
      rgb[targetIndex + 2] = pixels[sourceIndex + 2] ?? 0;
    }
  }
  return { width, height, data: deflateSync(rgb) };
}

function createReceiptPdf(order: { id: string; delivery_email: string; delivery_name: string; delivery_address: string; delivery_city: string; delivery_country: string; subtotal: number; shipping: number; total: number; placed_at: string; payment_reference: string | null }, items: Array<{ product_name: string; size: number; quantity: number; unit_price: number }>, logo?: Buffer) {
  const image = logo ? preparePngForPdf(logo) : undefined;
  const money = (amount: number) => `GHS ${amount.toFixed(2)}`;
  const escape = (value: string) => value.replace(/[\\()]/g, (character) => `\\${character}`).replace(/[^\x20-\x7E]/g, "?");
  const text = (value: string, x: number, y: number, size = 10, font = "F1") => `BT /${font} ${size} Tf ${x} ${y} Td (${escape(value)}) Tj ET`;
  const rowText = items.slice(0, 12).map((item, index) => {
    const y = 520 - index * 25;
    const separator = `0.88 0.88 0.88 RG 55 ${y - 10} m 557 ${y - 10} l S`;
    return `${separator} ${text(item.product_name, 58, y, 9)} ${text(String(item.size), 310, y, 9)} ${text(String(item.quantity), 380, y, 9)} ${text(money(item.unit_price * item.quantity), 440, y, 9)}`;
  }).join(" ");
  const content = [
    "q 0.98 0.72 0.12 rg 40 650 532 100 re f Q",
    "q 1 1 1 rg 40 40 532 590 re f Q",
    ...(image ? ["q 1 1 1 rg 55 690 80 80 re f Q", "q 78 0 0 78 56 691 cm /Logo Do Q"] : []),
    "0 0 0 rg",
    text("BIG PEE KICKS", 155, 731, 20, "F2"),
    text("OFFICIAL SALES RECEIPT", 155, 708, 9, "F2"),
    text(`ORDER ${order.id}`, 430, 728, 9, "F2"),
    text(new Date(order.placed_at).toLocaleDateString("en-GH"), 430, 710, 9),
    "0.16 0.16 0.16 rg",
    text("CUSTOMER", 58, 625, 8, "F2"), text(order.delivery_name, 58, 608, 11, "F2"), text(order.delivery_email, 58, 590, 9),
    text("DELIVERY", 330, 625, 8, "F2"), text(order.delivery_address, 330, 608, 9), text(`${order.delivery_city}, ${order.delivery_country}`, 330, 590, 9),
    "0.98 0.72 0.12 RG 40 565 m 572 565 l S",
    text("ITEM", 58, 548, 8, "F2"), text("SIZE", 310, 548, 8, "F2"), text("QTY", 380, 548, 8, "F2"), text("AMOUNT", 440, 548, 8, "F2"),
    rowText,
    "0.98 0.72 0.12 rg 360 105 212 115 re f",
    "0.16 0.16 0.16 rg",
    text(`Subtotal  ${money(order.subtotal)}`, 385, 195, 9),
    text(`Shipping  ${money(order.shipping)}`, 385, 175, 9),
    text(`TOTAL  ${money(order.total)}`, 385, 143, 13, "F2"),
    text("PAYMENT STATUS", 58, 195, 8, "F2"),
    text("PAID", 58, 177, 12, "F2"),
    text(`REFERENCE  ${order.payment_reference ?? "N/A"}`, 58, 157, 8),
    text("Thank you for shopping with Big Pee Kicks.", 58, 92, 9, "F2"),
    text("This receipt is an official record of your completed purchase.", 58, 74, 8),
  ].join(" ");
  const objects: Buffer[] = [
    Buffer.from("<</Type /Catalog /Pages 2 0 R>>"),
    Buffer.from("<</Type /Pages /Kids [3 0 R] /Count 1>>"),
    Buffer.from(`<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${image ? " /XObject << /Logo 7 0 R >>" : ""} >> >>`),
    Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
    Buffer.from("<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>"),
    Buffer.from("<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>"),
    ...(image ? [Buffer.concat([Buffer.from(`<</Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >> /Length ${image.data.length} >>\nstream\n`), image.data, Buffer.from("\nendstream")])] : []),
  ];
  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  const body: Buffer[] = [header];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(body).length);
    body.push(Buffer.from(`${index + 1} 0 obj\n`), objects[index] ?? Buffer.alloc(0), Buffer.from("\nendobj\n"));
  }
  const xrefOffset = Buffer.concat(body).length;
  body.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<</Root 1 0 R /Size ${objects.length + 1}>>\nstartxref\n${xrefOffset}\n%%EOF`));
  return Buffer.concat(body);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const requestUrl = new URL(request.url);
      if (requestUrl.pathname === "/api/cron/release-stock-reservations" && request.method === "GET") {
        const cronSecret = process.env["CRON_SECRET"];
        if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
        await releaseExpiredReservations(getDatabase());
        return Response.json({ released: true });
      }
      if (requestUrl.pathname.startsWith("/uploads/products/") && request.method === "GET") {
        const relativePath = decodeURIComponent(requestUrl.pathname.slice("/uploads/".length));
        const filePath = normalize(join(process.cwd(), "uploads", relativePath));
        if (!filePath.startsWith(normalize(join(process.cwd(), "uploads")))) return new Response("Not found", { status: 404 });
        try {
          const file = await readFile(filePath);
          const contentType = filePath.endsWith(".png") ? "image/png" : filePath.endsWith(".webp") ? "image/webp" : "image/jpeg";
          return new Response(file, { headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" } });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }
      if (requestUrl.pathname === "/api/cart" && (request.method === "GET" || request.method === "PUT" || request.method === "DELETE")) {
        const database = getDatabase();
        const cart = await getCartId(database, request);
        const headers = cart.cookie ? { "set-cookie": cart.cookie } : undefined;
        if (request.method === "GET") return new Response(JSON.stringify(await readCart(database, cart.id)), { headers: { "content-type": "application/json", ...(headers ?? {}) } });
        if (request.method === "DELETE") {
          await replaceCart(database, cart.id, []);
          return new Response("[]", { headers: { "content-type": "application/json", ...(headers ?? {}) } });
        }
        const lines = await request.json() as Parameters<typeof replaceCart>[2];
        return new Response(JSON.stringify(await replaceCart(database, cart.id, lines)), { headers: { "content-type": "application/json", ...(headers ?? {}) } });
      }
      if (requestUrl.pathname === "/api/health" && request.method === "GET") return Response.json({ ok: true, service: "big-pee-kicks" });
      if (requestUrl.pathname === "/api/shipping/quote" && request.method === "POST") {
        const payload = await request.json() as { city?: string; method?: "standard" | "express"; subtotal?: number; promoCode?: string };
        const database = getDatabase();
        const quote = await quoteShipping(database, payload.city ?? "", payload.method === "express" ? "express" : "standard", Number.isFinite(payload.subtotal) ? payload.subtotal! : 0, payload.promoCode);
        return Response.json(quote);
      }
      if (requestUrl.pathname === "/api/buyer/register" && request.method === "POST") {
        const payload = await request.json() as { name?: string; email?: string; password?: string };
        const result = await registerBuyer(getDatabase(), payload.name ?? "", payload.email ?? "", payload.password ?? "");
        if (!result) return Response.json({ error: "Unable to create account" }, { status: 400 });
        return new Response(JSON.stringify(result.buyer), { headers: { "content-type": "application/json", "set-cookie": result.cookie } });
      }
      if (requestUrl.pathname === "/api/buyer/login" && request.method === "POST") {
        const payload = await request.json() as { email?: string; password?: string };
        const result = await loginBuyer(getDatabase(), payload.email ?? "", payload.password ?? "");
        if (!result) return Response.json({ error: "Email or password is incorrect" }, { status: 401 });
        return new Response(JSON.stringify(result.buyer), { headers: { "content-type": "application/json", "set-cookie": result.cookie } });
      }
      if (requestUrl.pathname === "/api/buyer/session" && request.method === "GET") return Response.json(await currentBuyer(getDatabase(), request));
      if (requestUrl.pathname === "/api/buyer/logout" && request.method === "POST") {
        const cookie = await logoutBuyer(getDatabase(), request);
        return new Response("{}", { headers: { "content-type": "application/json", ...(cookie ? { "set-cookie": cookie } : {}) } });
      }
      if (requestUrl.pathname === "/api/buyer/orders" && request.method === "GET") {
        const buyer = await currentBuyer(getDatabase(), request);
        if (!buyer) return Response.json({ error: "Buyer authentication required" }, { status: 401 });
        return Response.json(await listOrders(getDatabase(), undefined, buyer.email));
      }
      if (requestUrl.pathname === "/api/orders" && request.method === "GET") {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        return Response.json(await listOrders(database));
      }
      if (requestUrl.pathname.startsWith("/api/orders/") && request.method === "PATCH") {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        const payload = await request.json() as { status?: string; returnStatus?: string };
        if (payload.returnStatus) {
          await updateReturnStatus(database, requestUrl.pathname.split("/").pop() ?? "", payload.returnStatus);
          return Response.json({ updated: true });
        }
        await updateOrderStatus(database, requestUrl.pathname.split("/").pop() ?? "", payload.status ?? "");
        return Response.json({ updated: true });
      }
      if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/return") && request.method === "POST") {
        const database = getDatabase();
        const buyer = await currentBuyer(database, request);
        const orderId = requestUrl.pathname.split("/").at(-2) ?? "";
        if (!buyer && !await isAdminRequest(database, request)) return Response.json({ error: "Authentication required" }, { status: 401 });
        await requestOrderReturn(database, orderId, buyer?.email);
        return Response.json({ requested: true });
      }
      if (requestUrl.pathname.startsWith("/api/orders/") && requestUrl.pathname.endsWith("/receipt") && request.method === "GET") {
        const orderId = requestUrl.pathname.split("/").at(-2) ?? "";
        const reference = requestUrl.searchParams.get("reference");
        const database = getDatabase();
        const order = await database.prepare("SELECT id, payment_status, payment_reference, delivery_email, delivery_name, delivery_address, delivery_city, delivery_country, subtotal, shipping, total, placed_at FROM orders WHERE id = ?").bind(orderId).all<{ id: string; payment_status: string; payment_reference: string | null; delivery_email: string; delivery_name: string; delivery_address: string; delivery_city: string; delivery_country: string; subtotal: number; shipping: number; total: number; placed_at: string }>();
        if (!order.results[0] || order.results[0].payment_status !== "Paid" || (reference !== order.results[0].payment_reference && !await isAdminRequest(database, request))) return Response.json({ error: "Receipt unavailable" }, { status: 404 });

        const orderRecord = order.results[0];
        const items = await database.prepare("SELECT product_name, size, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY id").bind(orderId).all<{ product_name: string; size: number; quantity: number; unit_price: number }>();
        const logo = await readFile(join(process.cwd(), "logo", "logo.png")).catch(() => undefined);
        const pdf = createReceiptPdf(orderRecord, items.results, logo);
        return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${orderId}-receipt.pdf"` } });
      }
      if (requestUrl.pathname === "/api/admin/login" && request.method === "POST") {
        const address = request.headers.get("x-forwarded-for") ?? "unknown";
        const attempt = loginAttempts.get(address);
        if (attempt && attempt.resetAt > Date.now() && attempt.count >= 5) return Response.json({ error: "Too many login attempts" }, { status: 429 });
      }
      if (requestUrl.pathname === "/api/admin/password" && request.method === "POST") {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        const payload = await request.json() as { currentPassword?: string; newPassword?: string };
        const changed = await changeAdminPassword(database, request, payload.currentPassword ?? "", payload.newPassword ?? "");
        return changed ? Response.json({ changed: true }) : Response.json({ error: "Password change failed" }, { status: 400 });
      }
      if (new URL(request.url).pathname === "/api/products") {
        const database = getDatabase();
        if (request.method === "GET") return Response.json(await listActiveProducts(database));
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        const payload = await request.json() as { action?: string; product?: Parameters<typeof createProduct>[1]; id?: string };
        if (payload.action === "create" && payload.product) {
          payload.product.image = await storeProductImage(payload.product.id, payload.product.image);
          await createProduct(database, payload.product);
          return Response.json(payload.product, { status: 201 });
        }
        if (payload.action === "update" && payload.product) {
          payload.product.image = await storeProductImage(payload.product.id, payload.product.image);
          await updateProduct(database, payload.product);
          return Response.json(payload.product);
        }
        if (payload.action === "delete" && payload.id) {
          await deleteProduct(database, payload.id);
          return Response.json({ id: payload.id });
        }
        return Response.json({ error: "Invalid product request" }, { status: 400 });
      }
      if (new URL(request.url).pathname === "/api/admin/login" && request.method === "POST") {
        const payload = await request.json() as { password?: string };
        const result = await loginAdmin(getDatabase(), payload.password ?? "");
        if (!result) {
          const address = request.headers.get("x-forwarded-for") ?? "unknown";
          const current = loginAttempts.get(address);
          loginAttempts.set(address, { count: (current?.count ?? 0) + 1, resetAt: current?.resetAt && current.resetAt > Date.now() ? current.resetAt : Date.now() + 15 * 60 * 1000 });
          return Response.json({ error: "Invalid password" }, { status: 401 });
        }
        return new Response(JSON.stringify({ name: result.name }), { headers: { "content-type": "application/json", "set-cookie": result.cookie } });
      }
      if (new URL(request.url).pathname === "/api/admin/session" && request.method === "GET") {
        const database = getDatabase();
        return Response.json({ isAdmin: await isAdminRequest(database, request), name: await adminName(database, request) });
      }
      if (new URL(request.url).pathname === "/api/admin/logout" && request.method === "POST") {
        const cookie = await logoutAdmin(getDatabase(), request);
        return new Response("{}", { headers: { "content-type": "application/json", ...(cookie ? { "set-cookie": cookie } : {}) } });
      }
      if (new URL(request.url).pathname === "/api/admin/notifications" && request.method === "GET") {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        return Response.json(await listNotifications(database));
      }
      if (requestUrl.pathname === "/api/admin/notifications/read" && request.method === "POST") {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        await markNotificationsRead(database);
        return Response.json({ marked: true });
      }
      if (requestUrl.pathname === "/api/admin/settings" && (request.method === "GET" || request.method === "PUT")) {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        const defaults = { storeName: "Big Pee Kicks", email: "hello@bigpeekicks.com", standardShipping: "12", expressShipping: "28", freeDeliveryThreshold: "200", promoCode: "BIGPEE10", promoDiscount: "10", adminPhone: process.env["ADMIN_PHONE"] ?? "" };
        if (request.method === "GET") {
          const rows = await database.prepare("SELECT key, value FROM store_settings").bind().all<{ key: keyof typeof defaults; value: string }>();
          return Response.json(rows.results.reduce((settings, row) => ({ ...settings, [row.key]: row.value }), defaults));
        }
        const settings = await request.json() as Partial<typeof defaults>;
        const previousRows = await database.prepare("SELECT key, value FROM store_settings").bind().all<{ key: keyof typeof defaults; value: string }>();
        const previous = previousRows.results.reduce((values, row) => ({ ...values, [row.key]: row.value }), {} as Partial<typeof defaults>);
        const changedSettings = (Object.keys(defaults) as Array<keyof typeof defaults>).filter((key) => typeof settings[key] === "string" && settings[key] !== previous[key]);
        for (const key of Object.keys(defaults) as Array<keyof typeof defaults>) if (typeof settings[key] === "string") await database.prepare("INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, settings[key], new Date().toISOString()).run();
        if (changedSettings.length) {
          const labels: Record<keyof typeof defaults, string> = { storeName: "Store name", email: "Support email", standardShipping: "Standard delivery", expressShipping: "Express delivery", freeDeliveryThreshold: "Free delivery threshold", promoCode: "Promo code", promoDiscount: "Promo discount", adminPhone: "Admin SMS phone" };
          const changes = changedSettings.map((key) => `${labels[key]}: ${settings[key]}`).join("; ");
          const message = `Admin settings updated. Changed ${changedSettings.length} field(s): ${changes}. Review checkout and store operations if shipping, promotion, or contact details changed.`;
          await createNotification(database, "Admin settings updated", message, undefined, "settings");
          await sendArkeselSms([await getAdminPhone(database)], `Big Pee Kicks admin alert: settings updated. ${changes}.`).catch((error) => console.error(error));
        }
        return Response.json({ saved: true });
      }
      if (requestUrl.pathname === "/api/admin/shipping-rates" && (request.method === "GET" || request.method === "PUT")) {
        const database = getDatabase();
        if (!await isAdminRequest(database, request)) return Response.json({ error: "Admin authentication required" }, { status: 401 });
        if (request.method === "GET") return Response.json((await database.prepare("SELECT location, standard, express FROM shipping_rates ORDER BY location").bind().all<{ location: string; standard: number; express: number }>()).results);
        const rates = await request.json() as Array<{ location: string; standard: number; express: number }>;
        for (const rate of rates) if (rate.location && Number.isFinite(rate.standard) && Number.isFinite(rate.express) && rate.standard >= 0 && rate.express >= 0) await database.prepare("INSERT INTO shipping_rates (location, standard, express, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(location) DO UPDATE SET standard = excluded.standard, express = excluded.express, updated_at = excluded.updated_at").bind(rate.location.trim(), rate.standard, rate.express, new Date().toISOString()).run();
        if (rates.length) {
          const summary = rates.map((rate) => `${rate.location}: standard GHS ${rate.standard.toFixed(2)}, express GHS ${rate.express.toFixed(2)}`).join("; ");
          await createNotification(database, "Delivery rates updated", `Admin updated delivery-by-location rates. ${summary}.`, undefined, "settings");
          await sendArkeselSms([await getAdminPhone(database)], `Big Pee Kicks admin alert: delivery rates updated. ${summary}.`).catch((error) => console.error(error));
        }
        return Response.json({ saved: true });
      }
      if (new URL(request.url).pathname === "/api/payments/paystack/initialize" && request.method === "POST") {
        const payload = await request.json() as Parameters<typeof createPendingOrder>[1];
        if (!payload.email || !payload.name || !payload.lines?.length || !payload.city || !["standard", "express"].includes(payload.method)) return Response.json({ error: "Complete checkout and delivery details are required" }, { status: 400 });
        const database = getDatabase();
        const order = await createPendingOrder(database, payload);
        try {
          const payment = await initializePaystackPayment({ email: payload.email, amount: order.total, callbackUrl: new URL(`/order-confirmation?orderId=${order.orderId}`, request.url).toString(), metadata: { orderId: order.orderId } });
          await attachPaymentReference(database, order.orderId, payment.reference);
          return Response.json({ ...payment, ...order });
        } catch (error) {
          await releaseOrderReservation(database, order.orderId);
          throw error;
        }
      }
      if (new URL(request.url).pathname === "/api/payments/paystack/verify" && request.method === "POST") {
        const payload = await request.json() as { reference?: string };
        if (!payload.reference) return Response.json({ error: "Payment reference is required" }, { status: 400 });
        const database = getDatabase();
        const order = await database.prepare("SELECT total FROM orders WHERE payment_reference = ?").bind(payload.reference).all<{ total: number }>();
        if (!order.results[0]) return Response.json({ error: "Payment reference does not match an order" }, { status: 404 });
        const verified = await verifyPaystackPayment(payload.reference, order.results[0].total);
        if (!verified) return Response.json({ paid: false }, { status: 402 });
        await markOrderPaid(database, payload.reference, toPesewas(order.results[0].total), "GHS");
        return Response.json({ paid: true });
      }
      if (new URL(request.url).pathname === "/api/payments/paystack/webhook" && request.method === "POST") {
        const secretKey = process.env["PAYSTACK_SECRET_KEY"];
        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = secretKey ? createHmac("sha512", secretKey).update(body).digest("hex") : "";
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (!signature || !expected || signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return Response.json({ error: "Invalid signature" }, { status: 401 });
        const event = JSON.parse(body) as { event?: string; data?: { reference?: string; amount?: number; currency?: string } };
        if (event.event === "charge.success" && event.data?.reference && typeof event.data.amount === "number" && event.data.currency) await markOrderPaid(getDatabase(), event.data.reference, event.data.amount, event.data.currency);
        return Response.json({ received: true });
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      if (process.env["NODE_ENV"] === "development") {
        return Response.json({ error: error instanceof Error ? error.message : "Unknown server error" }, { status: 500 });
      }
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
