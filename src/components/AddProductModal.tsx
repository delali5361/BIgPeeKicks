import { useState } from "react";
import { X } from "lucide-react";
import type { Product } from "@/data/products";
import { toast } from "sonner";
import { BusyButton } from "@/components/BusyButton";

type AddProductModalProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (product: Omit<Product, "id"> & { stock: number; status: "Active" | "Draft" | "Archived" }) => Promise<void>;
};

const categoryOptions: Product["category"][] = ["Shoes", "Sneakers", "Slippers"];

export function AddProductModal({ open, onClose, onAdd }: AddProductModalProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "Shoes" as Product["category"],
    tag: "",
    description: "",
    price: 0,
    sizes: "40,41,42,43,44",
    stock: 12,
    status: "Active" as "Active" | "Draft" | "Archived",
  });

  const handleImageChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be smaller than 5 MB.");
      return;
    }
    setImageError("");
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile || !imagePreview) {
      setImageError("Upload a product image before saving.");
      return;
    }
    setSaving(true);
    try { await onAdd({
      name: formData.name,
      category: formData.category,
      tag: formData.tag,
      description: formData.description,
      price: formData.price,
      sizes: formData.sizes.split(",").map((s) => parseInt(s.trim(), 10)),
      image: imagePreview,
      popularity: 50,
      createdAt: new Date().toISOString().slice(0, 10),
      stock: formData.stock,
      status: formData.status,
    }); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save product"); return; } finally { setSaving(false); }
    toast.success(`${formData.name} added to inventory`);
    setFormData({
      name: "",
      category: "Shoes",
      tag: "",
      price: 0,
      sizes: "40,41,42,43,44",
      stock: 12,
      status: "Active",
      description: "",
    });
    setImageFile(null);
    setImagePreview("");
    setImageError("");
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity"
      />
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:px-5 sm:py-8">
        <div className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-5 relative sm:max-h-[calc(100vh-4rem)] sm:p-8">
          <button
            disabled={saving}
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="size-4" />
          </button>

          <h2 className="font-display text-2xl">Add new product</h2>
          <p className="mt-2 text-sm text-muted-foreground">Fill in the details to add to inventory.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Product name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">Description</label>
              <textarea required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the fit, materials, and feel" rows={3} className="mt-2 w-full resize-none rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">Stock quantity</label>
                <input type="number" required min="0" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value, 10) || 0 })} className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">Status</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as typeof formData.status })} className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary">
                  <option>Active</option>
                  <option>Draft</option>
                  <option>Archived</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as Product["category"] })}
                className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none transition-colors focus:border-primary"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Tag
              </label>
              <input
                type="text"
                required
                value={formData.tag}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                placeholder="e.g., New drop, Best seller"
                className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Price
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Sizes (comma-separated)
              </label>
              <input
                type="text"
                required
                value={formData.sizes}
                onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                placeholder="40, 41, 42, 43, 44"
                className="mt-2 w-full rounded-md border border-border bg-background px-4 py-2 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-display uppercase tracking-[0.1em] text-muted-foreground">
                Product image
              </label>
              <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-background px-4 py-4 transition-colors hover:border-primary">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => handleImageChange(event.target.files?.[0])}
                  className="sr-only"
                />
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="size-16 rounded-md object-cover" />
                ) : (
                  <span className="text-sm text-muted-foreground">Choose JPG, PNG, or WebP (max 5 MB)</span>
                )}
                {imageFile && <span className="truncate text-sm text-primary">{imageFile.name}</span>}
              </label>
              {imageError && <p className="mt-2 text-xs text-red-400">{imageError}</p>}
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="flex-1 rounded-md border border-border px-4 py-2.5 font-display text-xs tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <BusyButton type="submit" busy={saving} className="ember-fill flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 font-display text-xs tracking-widest transition-transform hover:scale-[1.01] disabled:opacity-50">
                {saving ? "Saving product..." : "Add product"}
              </BusyButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
