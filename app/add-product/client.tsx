"use client";

import { useState } from "react";
import { createProduct } from "@/lib/actions/products";
import ProductImageUpload from "@/components/product-image-upload";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AddProductClient({ existingCategories = [] }: { existingCategories?: string[] }) {
  const [imageUrl, setImageUrl] = useState("");

  return (
    <div>
      <Link
        href="/inventory"
        style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-2)", textDecoration: "none", marginBottom: "16px" }}
      >
        <ArrowLeft style={{ width: "12px", height: "12px" }} /> Back to Inventory
      </Link>

      <div className="card" style={{ padding: "24px", maxWidth: "480px" }}>
        <form
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          action={async (formData: FormData) => {
            if (imageUrl) formData.set("imageUrl", imageUrl);
            await createProduct(formData);
          }}
        >
          <div>
            <label className="form-label">Product Image <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <ProductImageUpload onUpload={setImageUrl} />
          </div>

          <div>
            <label htmlFor="name" className="form-label">Product Name <span style={{ color: "var(--red)" }}>*</span></label>
            <input type="text" id="name" name="name" required className="input-field" placeholder="e.g. Wireless Keyboard" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label htmlFor="quantity" className="form-label">Quantity <span style={{ color: "var(--red)" }}>*</span></label>
              <input type="number" id="quantity" name="quantity" min="0" required className="input-field" placeholder="0" />
            </div>
            <div>
              <label htmlFor="price" className="form-label">Price <span style={{ color: "var(--red)" }}>*</span></label>
              <input type="number" id="price" name="price" step="0.01" min="0" required className="input-field" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label htmlFor="sku" className="form-label">SKU <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input type="text" id="sku" name="sku" className="input-field" placeholder="e.g. WK-001" />
          </div>

          <div>
            <label htmlFor="category" className="form-label">Category <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              type="text"
              id="category"
              name="category"
              className="input-field"
              placeholder="e.g. Electronics, Home"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {existingCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label htmlFor="lowStockAt" className="form-label">Low Stock Alert <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input type="number" id="lowStockAt" name="lowStockAt" min="0" className="input-field" placeholder="Alert when below this quantity" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
            <button type="submit" className="btn-accent" style={{ width: "100%", justifyContent: "center", padding: "8px" }}>
              Add Product
            </button>
            <Link
              href="/inventory"
              className="btn-ghost"
              style={{ width: "100%", justifyContent: "center", padding: "7px", textDecoration: "none" }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
