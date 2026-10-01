import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { CatalogDatabase } from "@/lib/catalog.server";

const SESSION_COOKIE = "big_pee_buyer_session";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32);
const storePassword = (password: string) => { const salt = randomBytes(16).toString("hex"); return `${salt}:${hashPassword(password, salt).toString("hex")}`; };
const matchesPassword = (password: string, stored: string) => { const [salt, hash] = stored.split(":"); if (!salt || !hash) return false; const expected = Buffer.from(hash, "hex"); const actual = hashPassword(password, salt); return expected.length === actual.length && timingSafeEqual(expected, actual); };

function tokenFrom(request: Request) { return request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1]; }

export async function registerBuyer(database: CatalogDatabase, name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (name.trim().length < 2 || !normalizedEmail || password.length < 6) return null;
  const existing = await database.prepare("SELECT id FROM buyer_accounts WHERE LOWER(email) = ?").bind(normalizedEmail).all<{ id: string }>();
  if (existing.results[0]) return null;
  const buyer = { id: `buyer-${randomBytes(8).toString("hex")}`, name: name.trim(), email: normalizedEmail, password_hash: storePassword(password) };
  await database.prepare("INSERT INTO buyer_accounts (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(buyer.id, buyer.name, buyer.email, buyer.password_hash, new Date().toISOString()).run();
  return createSession(database, buyer.id, buyer.name, buyer.email);
}

export async function loginBuyer(database: CatalogDatabase, email: string, password: string) {
  const result = await database.prepare("SELECT id, name, email, password_hash FROM buyer_accounts WHERE LOWER(email) = ?").bind(email.trim().toLowerCase()).all<{ id: string; name: string; email: string; password_hash: string }>();
  const buyer = result.results[0];
  if (!buyer || !matchesPassword(password, buyer.password_hash)) return null;
  return createSession(database, buyer.id, buyer.name, buyer.email);
}

async function createSession(database: CatalogDatabase, id: string, name: string, email: string) {
  const token = randomBytes(32).toString("hex");
  await database.prepare("INSERT INTO buyer_sessions (token_hash, buyer_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(hashToken(token), id, new Date(Date.now() + 30 * 86400000).toISOString(), new Date().toISOString()).run();
  return { buyer: { id, name, email }, cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` };
}

export async function currentBuyer(database: CatalogDatabase, request: Request) {
  const token = tokenFrom(request);
  if (!token) return null;
  const result = await database.prepare("SELECT b.id, b.name, b.email FROM buyer_sessions s JOIN buyer_accounts b ON b.id = s.buyer_id WHERE s.token_hash = ? AND s.expires_at >= ?").bind(hashToken(token), new Date().toISOString()).all<{ id: string; name: string; email: string }>();
  return result.results[0] ?? null;
}

export async function logoutBuyer(database: CatalogDatabase, request: Request) {
  const token = tokenFrom(request);
  if (token) await database.prepare("DELETE FROM buyer_sessions WHERE token_hash = ?").bind(hashToken(token)).run();
  return token ? `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` : null;
}