"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  quantity: number;
  lowStockAt: number | null;
  imageUrl?: string | null;
}

interface GalleryViewProps {
  items: Product[];
  onAdjust: (id: string, delta: number) => void;
  onDelete: (id: string) => void;
}

export default function GalleryView({ items }: GalleryViewProps) {
  const router = useRouter();

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      gap: 12,
      padding: 16,
    }}>
      {items.map((p) => {
        const isOut = p.quantity === 0;
        const isLow = !isOut && p.lowStockAt !== null && p.quantity <= p.lowStockAt;
        const dotColor = isOut ? "var(--red)" : isLow ? "var(--amber)" : "var(--accent)";
        const badgeCls = isOut ? "badge badge-low" : isLow ? "badge badge-warn" : "badge badge-ok";
        const badgeLabel = isOut ? "Out" : isLow ? "Low" : "OK";

        return (
          <div
            key={p.id}
            onClick={() => router.push(`/add-product?id=${p.id}`)}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-dim)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
              cursor: "pointer",
              transition: "border-color 0.1s, transform 0.1s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-normal)";
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-dim)";
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
            }}
          >
            {/* Image */}
            <div style={{
              width: "100%", aspectRatio: "1",
              background: "var(--bg-surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", position: "relative",
            }}>
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt={p.name}
                  fill
                  sizes="180px"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <Package size={32} strokeWidth={1} style={{ color: "var(--text-3)" }} />
              )}
            </div>

            {/* Info */}
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </div>
              {p.sku && (
                <div className="mono text-3" style={{ fontSize: 10, marginBottom: 6 }}>{p.sku}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 11, color: dotColor, fontWeight: 600 }}>
                  {p.quantity}
                </span>
                <span className={badgeCls}>{badgeLabel}</span>
              </div>
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 12 }}>
          No products found.
        </div>
      )}
    </div>
  );
}
