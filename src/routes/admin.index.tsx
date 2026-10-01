import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Package, Plus, Search } from "lucide-react";
import { useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import { AddProductModal } from "@/components/AddProductModal";
import type { Product } from "@/data/products";
import { useAuth } from "@/context/auth";
import { useCatalog, type CatalogProduct } from "@/context/catalog";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";
import { userFacingError } from "@/lib/user-error";

const categories: Array<"All" | Product["category"]> = ["All", "Shoes", "Sneakers", "Slippers"];

export const Route = createFileRoute("/admin/")({ component: InventoryPage });

function InventoryPage() {
  const { isAdmin } = useAuth();
  const { products: inventory, addProduct, updateProduct, removeProduct } = useCatalog();
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [sizeEditor, setSizeEditor] = useState<CatalogProduct | null>(null);
  const [sizeValue, setSizeValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);
  const [busyAction, setBusyAction] = useState("");
  if (!isAdmin) return <AdminGuard />;
  const visible = inventory.filter((product) => {
    const text = `${product.name} ${product.tag} ${product.category}`.toLowerCase();
    return (
      (category === "All" || product.category === category) &&
      (status === "All" ||
        product.status === status ||
        (status === "Out of stock" && product.stock === 0)) &&
      text.includes(search.toLowerCase())
    );
  });
  const editSizes = (product: CatalogProduct) => {
    setSizeEditor(product);
    setSizeValue(product.sizes.join(", "));
  };
  const saveSizes = async () => {
    if (!sizeEditor) return;
    const sizes = sizeValue.split(",").map((item) => Number(item.trim())).filter(Boolean);
    if (!sizes.length) {
      toast.error("Enter at least one EU size");
      return;
    }
    setBusyAction(`sizes:${sizeEditor.id}`);
    try {
      await updateProduct(sizeEditor.id, { sizes });
      toast.success(`${sizeEditor.name} sizes updated`);
      setSizeEditor(null);
    } catch (error) {
      toast.error(userFacingError(error, "We couldn't update product sizes. Please contact the store administrator."));
    } finally {
      setBusyAction("");
    }
  };
  const updateInventory = async (id: string, changes: Partial<CatalogProduct>, key: string) => {
    setBusyAction(`${key}:${id}`);
    try {
      await updateProduct(id, changes);
    } catch (error) {
      toast.error(userFacingError(error, "We couldn't update this product. Please contact the store administrator."));
    } finally {
      setBusyAction("");
    }
  };
  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-8">
      <div className="flex flex-col justify-between gap-5 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Big Pee Kicks / Admin</p>
          <h1 className="mt-3 text-5xl leading-none sm:text-6xl">Inventory</h1>
          <p className="mt-4 text-muted-foreground">
            Manage products, variants, stock, and publishing status.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="ember-fill inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 font-display text-xs tracking-widest"
        >
          <Plus className="size-4" /> Add product
        </button>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">Products</p>
          <p className="mt-2 font-display text-3xl text-primary">{inventory.length}</p>
        </div>
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-2 font-display text-3xl text-primary">
            {inventory.filter((product) => product.status === "Active").length}
          </p>
        </div>
        <div className="border border-border bg-surface p-5">
          <p className="text-sm text-muted-foreground">Low stock</p>
          <p className="mt-2 font-display text-3xl text-primary">
            {inventory.filter((product) => product.stock < 5).length}
          </p>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-3 border-y border-border py-5 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 border border-border bg-surface px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
          className="border border-border bg-surface px-3 py-2 text-sm"
        >
          <option>All</option>
          <option>Shoes</option>
          <option>Sneakers</option>
          <option>Slippers</option>
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="border border-border bg-surface px-3 py-2 text-sm"
        >
          <option>All</option>
          <option>Active</option>
          <option>Draft</option>
          <option>Archived</option>
          <option>Out of stock</option>
        </select>
      </div>
      <div className="mt-6 space-y-3">
        {visible.map((product) => (
          <article
            key={product.id}
            className="flex flex-col gap-4 border border-border bg-surface p-4 sm:flex-row sm:items-center"
          >
            <img
              src={product.image}
              alt={product.name}
              className="size-20 rounded-md object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display">{product.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {product.category} · {product.tag} · {formatPrice(product.price)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sizes: {product.sizes.join(", ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={product.stock}
                  disabled={busyAction.startsWith("stock:")}
                  onChange={(event) => void updateInventory(product.id, { stock: Math.max(0, Number(event.target.value)) }, "stock")}
                  className="w-20 rounded border border-border bg-background px-2 py-2 pr-7 text-sm disabled:opacity-60"
                  aria-label={`Stock for ${product.name}`}
                />
                {busyAction === `stock:${product.id}` && <LoaderCircle className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" aria-label="Saving stock" />}
              </div>
              <div className="relative">
                <select
                  value={product.status}
                  disabled={busyAction.startsWith("status:")}
                  onChange={(event) => void updateInventory(product.id, { status: event.target.value as CatalogProduct["status"] }, "status")}
                  className="rounded border border-border bg-background px-2 py-2 pr-7 text-sm disabled:opacity-60"
                >
                  <option>Active</option>
                  <option>Draft</option>
                  <option>Archived</option>
                </select>
                {busyAction === `status:${product.id}` && <LoaderCircle className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" aria-label="Saving status" />}
              </div>
              <button
                onClick={() => editSizes(product)} disabled={Boolean(busyAction)}
                className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {busyAction === `sizes:${product.id}` && <LoaderCircle className="size-3.5 animate-spin" />} Sizes
              </button>
              <button
                onClick={() => setDeleteTarget(product)} disabled={Boolean(busyAction)}
                className="rounded border border-border px-3 py-2 text-xs text-red-400 hover:border-red-400 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
            <Package className="hidden size-4 text-primary sm:block" />
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="py-12 text-center text-muted-foreground">No products match these filters.</p>
      )}
      {sizeEditor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-5 backdrop-blur-sm"><div className="w-full max-w-md border border-border bg-surface p-6 shadow-deep"><h2 className="font-display text-lg">Edit EU sizes</h2><p className="mt-2 text-sm text-muted-foreground">{sizeEditor.name}</p><input autoFocus disabled={busyAction === `sizes:${sizeEditor.id}`} value={sizeValue} onChange={(event) => setSizeValue(event.target.value)} placeholder="40, 41, 42, 43" className="mt-5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" /><div className="mt-5 flex justify-end gap-3"><button type="button" disabled={Boolean(busyAction)} onClick={() => setSizeEditor(null)} className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground disabled:opacity-50">Cancel</button><button type="button" disabled={Boolean(busyAction)} onClick={saveSizes} className="ember-fill inline-flex items-center gap-2 rounded-md px-4 py-2 font-display text-xs tracking-widest disabled:opacity-50">{busyAction === `sizes:${sizeEditor.id}` && <LoaderCircle className="size-3.5 animate-spin" />}Save sizes</button></div></div></div>}
      {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 px-5 backdrop-blur-sm"><div className="w-full max-w-md border border-border bg-surface p-6 shadow-deep"><h2 className="font-display text-lg">Delete product?</h2><p className="mt-2 text-sm text-muted-foreground">This will remove {deleteTarget.name} from inventory.</p><div className="mt-5 flex justify-end gap-3"><button type="button" disabled={Boolean(busyAction)} onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground disabled:opacity-50">Cancel</button><button type="button" disabled={Boolean(busyAction)} onClick={() => { void (async () => { setBusyAction(`delete:${deleteTarget.id}`); try { await removeProduct(deleteTarget.id); toast.success(`${deleteTarget.name} deleted`); setDeleteTarget(null); } catch (error) { toast.error(userFacingError(error, "We couldn't delete this product. Please contact the store administrator.")); } finally { setBusyAction(""); } })(); }} className="inline-flex items-center gap-2 rounded-md border border-red-400 px-4 py-2 text-xs text-red-400 disabled:opacity-50">{busyAction === `delete:${deleteTarget.id}` && <LoaderCircle className="size-3.5 animate-spin" />}Delete product</button></div></div></div>}
      <AddProductModal open={open} onClose={() => setOpen(false)} onAdd={addProduct} />
    </div>
  );
}
