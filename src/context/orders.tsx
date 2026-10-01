import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartLine } from "@/components/CartDrawer";

export type OrderStatus = "Processing" | "Shipped" | "Delivered" | "Cancelled";
export type PaymentStatus = "Pending" | "Paid" | "Failed" | "Refunded";
export type Order = {
  id: string;
  buyerId?: string;
  lines: CartLine[];
  total: number;
  shipping: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  placedAt: string;
  estimatedDelivery: string;
  delivery: { email: string; name: string; address: string; city: string; country: string };
  returnStatus?: "Requested" | "Approved" | "Rejected";
  returnReason?: string;
};

type OrdersContextValue = {
  orders: Order[];
  placeOrder: (order: Omit<Order, "id" | "placedAt" | "status" | "paymentStatus" | "estimatedDelivery">) => Order;
  requestReturn: (id: string) => Promise<void>;
  updateOrder: (id: string, changes: Partial<Order>) => Promise<void>;
  reloadOrders: () => Promise<void>;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);
export function useOrders() {
  const value = useContext(OrdersContext);
  if (!value) throw new Error("useOrders must be used inside OrdersProvider");
  return value;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const reloadOrders = useCallback(async () => {
    const responses = await Promise.all([fetch("/api/buyer/orders"), fetch("/api/orders")]);
    const response = responses.find((item) => item.ok);
    if (response) setOrders(await response.json() as Order[]);
  }, []);
  useEffect(() => {
    void reloadOrders().catch(() => undefined);
  }, []);
  const persist = (next: Order[]) => { setOrders(next); };
  const placeOrder = (order: Omit<Order, "id" | "placedAt" | "status" | "paymentStatus" | "estimatedDelivery">) => {
    const nextOrder: Order = { ...order, id: `BPK-${Date.now().toString().slice(-8)}`, placedAt: new Date().toISOString(), status: "Processing", paymentStatus: "Pending", estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString() };
    persist([nextOrder, ...orders]);
    return nextOrder;
  };
  const requestReturn = async (id: string) => {
    const response = await fetch(`/api/orders/${id}/return`, { method: "POST" });
    if (!response.ok) throw new Error("Unable to request return");
    persist(orders.map((order) => order.id === id ? { ...order, returnStatus: "Requested" as const } : order));
  };
  const updateOrder = async (id: string, changes: Partial<Order>) => {
    const next = orders.map((order) => order.id === id ? { ...order, ...changes } : order);
    if (changes.status || changes.returnStatus) {
      const response = await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes.status ? { status: changes.status } : { returnStatus: changes.returnStatus }) });
      if (!response.ok) throw new Error("Unable to update order");
    }
    persist(next);
  };
  return <OrdersContext.Provider value={{ orders, placeOrder, requestReturn, updateOrder, reloadOrders }}>{children}</OrdersContext.Provider>;
}
