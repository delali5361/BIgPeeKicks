export type Product = {
  id: string;
  category: "Shoes" | "Sneakers" | "Slippers";
  name: string;
  tag: string;
  price: number;
  image: string;
  images?: string[];
  sizes: number[];
  description: string;
  popularity: number;
  createdAt: string;
};

export type CatalogProduct = Product & {
  stock: number;
  status: "Active" | "Draft" | "Archived";
};

export const products: Product[] = [];
