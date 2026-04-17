import Sidebar from "@/components/sidebar";
import { createProduct } from "@/lib/actions/products";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

const inputStyle = {
  background: "rgba(56,189,248,0.05)",
  border: "1px solid rgba(56,189,248,0.2)",
  color: "#e2e8f0",
  borderRadius: "8px",
};

const labelStyle = {
  color: "rgba(226,232,240,0.7)",
  fontSize: "0.875rem",
  fontWeight: 500,
};

export default async function AddProductPage() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f" }}>
      <Sidebar currentPath="/add-product" />
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#e2e8f0" }}>Add Product</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(226,232,240,0.5)" }}>
            Add a new product to your inventory
          </p>
        </div>

        <div className="max-w-2xl">
          <div className="p-6" style={{ background: "rgba(13,13,26,0.8)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: "12px" }}>
            <form className="space-y-6" action={createProduct}>
              <div>
                <label htmlFor="name" className="block mb-2" style={labelStyle}>Product Name *</label>
                <input type="text" id="name" name="name" required
                  className="w-full px-4 py-2.5 outline-none focus:ring-1"
                  style={{ ...inputStyle, "--tw-ring-color": "#38bdf8" } as React.CSSProperties}
                  placeholder="Enter product name" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label htmlFor="quantity" className="block mb-2" style={labelStyle}>Quantity *</label>
                  <input type="number" id="quantity" name="quantity" min="0" required
                    className="w-full px-4 py-2.5 outline-none"
                    style={inputStyle}
                    placeholder="0" />
                </div>
                <div>
                  <label htmlFor="price" className="block mb-2" style={labelStyle}>Price *</label>
                  <input type="number" id="price" name="price" step="0.01" min="0" required
                    className="w-full px-4 py-2.5 outline-none"
                    style={inputStyle}
                    placeholder="0.00" />
                </div>
              </div>

              <div>
                <label htmlFor="sku" className="block mb-2" style={labelStyle}>SKU (optional)</label>
                <input type="text" id="sku" name="sku"
                  className="w-full px-4 py-2.5 outline-none"
                  style={inputStyle}
                  placeholder="Enter SKU" />
              </div>

              <div>
                <label htmlFor="lowStockAt" className="block mb-2" style={labelStyle}>Low Stock At (optional)</label>
                <input type="number" id="lowStockAt" name="lowStockAt" min="0"
                  className="w-full px-4 py-2.5 outline-none"
                  style={inputStyle}
                  placeholder="Enter low stock threshold" />
              </div>

              <div className="flex gap-4 pt-2">
                <button type="submit"
                  className="px-6 py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(90deg, #38bdf8, #7c3aed)", color: "white" }}>
                  Add Product
                </button>
                <Link href="/inventory"
                  className="px-6 py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-80"
                  style={{ border: "1px solid rgba(226,232,240,0.15)", color: "rgba(226,232,240,0.6)", background: "rgba(226,232,240,0.05)" }}>
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
