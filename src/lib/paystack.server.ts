import { randomBytes } from "node:crypto";
import { toPesewas } from "@/lib/currency";

type PaystackResponse = {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
};

export async function initializePaystackPayment(input: {
  email: string;
  amount: number;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  const secretKey = process.env["PAYSTACK_SECRET_KEY"];
  if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const reference = `BPK-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: toPesewas(input.amount), currency: "GHS", reference, callback_url: input.callbackUrl, metadata: input.metadata }),
  });
  const result = await response.json() as PaystackResponse;
  if (!response.ok || !result.status || !result.data) throw new Error(result.message || "Paystack initialization failed");
  return result.data;
}

export async function verifyPaystackPayment(reference: string, expectedAmount: number): Promise<boolean> {
  const secretKey = process.env["PAYSTACK_SECRET_KEY"];
  if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const result = await response.json() as { status: boolean; data?: { status?: string; reference?: string; amount?: number; currency?: string } };
  return response.ok && result.status && result.data?.status === "success" && result.data.reference === reference && result.data.amount === toPesewas(expectedAmount) && result.data.currency === "GHS";
}