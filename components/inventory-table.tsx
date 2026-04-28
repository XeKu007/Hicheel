"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  quantity: number;
  lowStockAt: number | null;
  imageUrl?: string | null;
  category?: string | null;
}

interface InventoryTableProps {
  items: Product[];
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, values: Partial<Product>) => Promise<void>;
}

function StatusCell({ product }: { product: Product }) {
  const isOut = product.quantity === 0;
  const isLow = !isOut && product.lowStockAt !== null && product.quantity <= product.lowStockAt;
  const dotClass = isOut ? "fill-low" : isLow ? "fill-warn" : "fill-ok";
  const max = Math.max(product.lowStockAt ?? 10, product.quantity, 1);
  const pct = Math.min(100, Math.round((product.quantity / max) * 100));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span className={`dot-status ${dotClass}`} style={{ background: isOut ? "var(--red)" : isLow ? "var(--amber)" : "var(--accent)" }} />
      <span className="stock-track">
        <span className={`stock-fill ${dotClass}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function EditModal({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (values: Partial<Product>) => Promise<void> }) {
  const [values, setValues] = useState({
    name: product.name, sku: product.sku ?? "", price: product.price,
    quantity: product.quantity, lowStockAt: product.lowStockAt ?? "" as number | string,
    category: product.category ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      name: values.name,
      price: values.price,
      quantity: values.quantity,
      sku: values.sku || null,
      lowStockAt: values.lowStockAt !== "" ? Number(values.lowStockAt) : null,
      category: values.category || null,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="modal-title" style={{ flex: 1 }}>Edit Product</div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "4px 8px", marginBottom: "18px" }}>
            <X style={{ width: "13px", height: "13px" }} />
          </button>
        </div>
        <form style={{ display: "flex", flexDirection: "column", gap: "14px" }} onSubmit={handleSubmit}>
          <div>
            <label className="form-label">Name</label>
            <input className="input-field" value={values.name} onChange={e => setValues(v => ({ ...v, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label className="form-label">Price</label>
              <input type="number" step="0.01" min="0" className="input-field" value={values.price} onChange={e => setValues(v => ({ ...v, price: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="form-label">Quantity</label>
              <input type="number" min="0" className="input-field" value={values.quantity} onChange={e => setValues(v => ({ ...v, quantity: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="form-label">SKU</label>
            <input className="input-field" value={values.sku} onChange={e => setValues(v => ({ ...v, sku: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">Low Stock Alert</label>
            <input type="number" min="0" className="input-field" value={values.lowStockAt} onChange={e => setValues(v => ({ ...v, lowStockAt: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <input className="input-field" value={values.category} onChange={e => setValues(v => ({ ...v, category: e.target.value }))} placeholder="e.g. Electronics" />
          </div>
          <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
            <button type="submit" disabled={saving} className="btn-accent" style={{ flex: 1, justifyContent: "center", opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 style={{ width: "12px", height: "12px", animation: "spin 1s linear infinite" }} /> : <Check style={{ width: "12px", height: "12px" }} />}
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InventoryTable({ items, onDelete, onUpdate }: InventoryTableProps) {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  if (items.length === 0) {
    return (
      <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--text-3)", fontSize: "12px" }}>
        No products found
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th style={{ textAlign: "right" }}>Stock</th>
            <th style={{ textAlign: "right" }}>Threshold</th>
            <th style={{ textAlign: "right" }}>Value</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(product => {
            const isOut = product.quantity === 0;
            const isLow = !isOut && product.lowStockAt !== null && product.quantity <= product.lowStockAt;
            const statusLabel = isOut ? "OUT" : isLow ? "LOW" : "IN STOCK";
            const badgeClass = isOut ? "badge badge-low" : isLow ? "badge badge-warn" : "badge badge-ok";

            return (
              <tr key={product.id}>
                <td>
                  <div style={{ fontWeight: 500, color: "var(--text-1)" }}>{product.name}</div>
                  {product.sku && <div className="tag-mono" style={{ marginTop: "3px", display: "inline-block" }}>{product.sku}</div>}
                </td>
                <td>
                  {product.category
                    ? <span className="tag-mono" style={{ fontSize: "11px", color: "var(--text-2)" }}>{product.category}</span>
                    : <span style={{ color: "var(--text-3)", fontSize: "11px" }}>—</span>
                  }
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="mono text-1" style={{ fontSize: "13px" }}>{product.quantity}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="mono text-2" style={{ fontSize: "12px" }}>{product.lowStockAt ?? "—"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="mono text-2" style={{ fontSize: "12px" }}>${(product.price * product.quantity).toFixed(2)}</span>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <StatusCell product={product} />
                    <span className={badgeClass}>{statusLabel}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="btn-ghost"
                      style={{ padding: "4px 8px" }}
                      title="Edit"
                    >
                      <Pencil style={{ width: "12px", height: "12px" }} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${product.name}"?`)) onDelete(product.id); }}
                      className="btn-ghost"
                      style={{ padding: "4px 8px", color: "var(--red)", borderColor: "rgba(255,68,68,0.25)" }}
                      title="Delete"
                    >
                      <Trash2 style={{ width: "12px", height: "12px" }} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editingProduct && (
        <EditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={async (values) => { await onUpdate(editingProduct.id, values); }}
        />
      )}
    </>
  );
}
