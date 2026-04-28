"use client";

import useSWR from "swr";
import { useState, useEffect, useMemo, useCallback } from "react";
import InventoryTable from "@/components/inventory-table";
import GalleryView from "@/components/gallery-view";
import Pagination from "@/components/pagination";
import { useViewPreference } from "@/lib/hooks/use-view-preference";
import { Plus, LayoutList, LayoutGrid, Folder, FolderOpen, Package, ChevronRight } from "lucide-react";
import Link from "next/link";
import ExportButton from "@/components/export-button";

interface Product {
  id: string; name: string; sku: string | null;
  price: number; quantity: number; lowStockAt: number | null;
  imageUrl?: string | null; category?: string | null;
}

interface CategoryItem {
  name: string;
  count: number;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function InventoryClient({
  initialItems,
  initialTotal,
  initialQ,
  initialPage,
  isManager,
  categories = [],
  uncategorizedCount = 0,
}: {
  initialItems: Product[];
  initialTotal: number;
  initialQ: string;
  initialPage: number;
  isManager: boolean;
  categories?: CategoryItem[];
  uncategorizedCount?: number;
}) {
  const pageSize = 10;
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(initialPage);
  const [inputQ, setInputQ] = useState(initialQ);
  const [filter, setFilter] = useState<"all" | "in_stock" | "low" | "critical">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useViewPreference();

  const { data, mutate, isLoading } = useSWR(
    `/api/products?q=${encodeURIComponent(q)}&page=${page}`,
    fetcher,
    {
      fallbackData: { items: initialItems, totalCount: initialTotal, totalPages: Math.ceil(initialTotal / pageSize) },
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      keepPreviousData: true,
    }
  );

  // SSE — real-time updates from other users, with auto-reconnect
  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    const MAX_RETRIES = 5;

    function connect() {
      es = new EventSource("/api/inventory-events");
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "product_updated") {
            mutate((current: { items: Product[]; totalCount: number; totalPages: number }) => ({
              ...current,
              items: current.items.map((p: Product) =>
                p.id === msg.product.id ? { ...p, ...msg.product } : p
              ),
            }), { revalidate: false });
          } else if (msg.type === "product_deleted") {
            mutate((current: { items: Product[]; totalCount: number; totalPages: number }) => ({
              ...current,
              items: current.items.filter((p: Product) => p.id !== msg.id),
              totalCount: current.totalCount - 1,
            }), { revalidate: false });
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        if (retries < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retries, 30000);
          retryTimeout = setTimeout(() => { retries++; connect(); }, delay);
        }
      };
      es.onopen = () => { retries = 0; };
    }

    connect();
    return () => {
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [mutate]);

  const allItems: Product[] = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages: number = data?.totalPages ?? 1;
  const totalCount: number = data?.totalCount ?? 0;

  const items = useMemo(() => {
    let result = allItems;
    if (filter === "in_stock") result = result.filter(p => p.quantity > 0 && (p.lowStockAt === null || p.quantity > p.lowStockAt));
    else if (filter === "low") result = result.filter(p => p.lowStockAt !== null && p.quantity > 0 && p.quantity <= p.lowStockAt);
    else if (filter === "critical") result = result.filter(p => p.quantity === 0);
    if (categoryFilter === "__uncategorized__") result = result.filter(p => !p.category);
    else if (categoryFilter !== "all") result = result.filter(p => p.category === categoryFilter);
    return result;
  }, [allItems, filter, categoryFilter]);

  const itemCount = useMemo(() => {
    const base = categoryFilter === "all"
      ? totalCount
      : categoryFilter === "__uncategorized__"
        ? uncategorizedCount
        : (categories.find(c => c.name === categoryFilter)?.count ?? items.length);
    return `${base} item${base !== 1 ? "s" : ""}`;
  }, [totalCount, categoryFilter, categories, uncategorizedCount, items.length]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(inputQ);
    setPage(1);
  }

  const handleAdjust = useCallback(async (id: string, delta: number) => {
    mutate(
      async (current: { items: Product[]; totalCount: number; totalPages: number }) => {
        const res = await fetch(`/api/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta }),
        });
        const updated = await res.json();
        return { ...current, items: current.items.map((p: Product) => p.id === id ? { ...p, ...updated } : p) };
      },
      {
        optimisticData: (current: { items: Product[]; totalCount: number; totalPages: number }) => ({
          ...current,
          items: current.items.map((p: Product) =>
            p.id === id ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p
          ),
        }),
        rollbackOnError: true, revalidate: false,
      }
    );
  }, [mutate]);

  const handleDelete = useCallback(async (id: string) => {
    const fallback = { items: allItems, totalCount, totalPages };
    mutate(
      async (current: { items: Product[]; totalCount: number; totalPages: number } | undefined) => {
        const safe = current ?? fallback;
        await fetch(`/api/products/${id}`, { method: "DELETE" });
        return { ...safe, items: safe.items.filter((p: Product) => p.id !== id), totalCount: safe.totalCount - 1 };
      },
      {
        optimisticData: (current: { items: Product[]; totalCount: number; totalPages: number } | undefined) => {
          const safe = current ?? fallback;
          return { ...safe, items: safe.items.filter((p: Product) => p.id !== id), totalCount: safe.totalCount - 1 };
        },
        rollbackOnError: true, revalidate: false,
      }
    );
  }, [mutate, allItems, totalCount, totalPages]);

  const handleUpdate = useCallback(async (id: string, values: Partial<Product>) => {
    mutate(
      async (current: { items: Product[]; totalCount: number; totalPages: number }) => {
        const res = await fetch(`/api/products/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const updated = await res.json();
        return { ...current, items: current.items.map((p: Product) => p.id === id ? { ...p, ...updated } : p) };
      },
      {
        optimisticData: (current: { items: Product[]; totalCount: number; totalPages: number }) => ({
          ...current,
          items: current.items.map((p: Product) => p.id === id ? { ...p, ...values } : p),
        }),
        rollbackOnError: true, revalidate: false,
      }
    );
  }, [mutate]);

  const hasFolders = categories.length > 0 || uncategorizedCount > 0;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* ── Folder / Category sidebar ── */}
      {hasFolders && (
        <div style={{
          width: "200px", flexShrink: 0,
          borderRight: "1px solid var(--border-dim)",
          display: "flex", flexDirection: "column",
          overflowY: "auto", background: "var(--bg-base)",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 12px 6px",
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--text-3)",
            borderBottom: "1px solid var(--border-dim)",
          }}>
            Folders
          </div>

          {/* All Items */}
          <button
            onClick={() => setCategoryFilter("all")}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 12px", width: "100%", textAlign: "left",
              background: categoryFilter === "all" ? "var(--accent-dim)" : "transparent",
              border: "none", cursor: "pointer",
              borderLeft: categoryFilter === "all" ? "2px solid var(--accent)" : "2px solid transparent",
              color: categoryFilter === "all" ? "var(--accent)" : "var(--text-2)",
              fontSize: "12px", fontWeight: categoryFilter === "all" ? 600 : 400,
              transition: "all 0.1s",
            }}
          >
            <Package size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              All Items
            </span>
            <span style={{
              fontSize: "10px", fontFamily: "var(--font-mono)",
              color: categoryFilter === "all" ? "var(--accent)" : "var(--text-3)",
              background: "var(--bg-raised)", borderRadius: "3px",
              padding: "1px 5px", flexShrink: 0,
            }}>
              {totalCount}
            </span>
          </button>

          {/* Named categories */}
          {categories.map(cat => {
            const isActive = categoryFilter === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setCategoryFilter(isActive ? "all" : cat.name)}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 12px", width: "100%", textAlign: "left",
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  border: "none", cursor: "pointer",
                  borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  color: isActive ? "var(--accent)" : "var(--text-2)",
                  fontSize: "12px", fontWeight: isActive ? 600 : 400,
                  transition: "all 0.1s",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-raised)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {isActive
                  ? <FolderOpen size={13} style={{ flexShrink: 0, color: "var(--accent)" }} />
                  : <Folder size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                }
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cat.name}
                </span>
                <span style={{
                  fontSize: "10px", fontFamily: "var(--font-mono)",
                  color: isActive ? "var(--accent)" : "var(--text-3)",
                  background: "var(--bg-raised)", borderRadius: "3px",
                  padding: "1px 5px", flexShrink: 0,
                }}>
                  {cat.count}
                </span>
              </button>
            );
          })}

          {/* Uncategorized */}
          {uncategorizedCount > 0 && (
            <button
              onClick={() => setCategoryFilter(categoryFilter === "__uncategorized__" ? "all" : "__uncategorized__")}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 12px", width: "100%", textAlign: "left",
                background: categoryFilter === "__uncategorized__" ? "var(--accent-dim)" : "transparent",
                border: "none", cursor: "pointer",
                borderLeft: categoryFilter === "__uncategorized__" ? "2px solid var(--accent)" : "2px solid transparent",
                color: categoryFilter === "__uncategorized__" ? "var(--accent)" : "var(--text-3)",
                fontSize: "12px", fontWeight: categoryFilter === "__uncategorized__" ? 600 : 400,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => { if (categoryFilter !== "__uncategorized__") (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-raised)"; }}
              onMouseLeave={e => { if (categoryFilter !== "__uncategorized__") (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <ChevronRight size={13} style={{ flexShrink: 0, opacity: 0.4 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
                Uncategorized
              </span>
              <span style={{
                fontSize: "10px", fontFamily: "var(--font-mono)",
                color: "var(--text-3)", background: "var(--bg-raised)",
                borderRadius: "3px", padding: "1px 5px", flexShrink: 0,
              }}>
                {uncategorizedCount}
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Toolbar */}
        <div className="toolbar">
          <form style={{ display: "flex", gap: "8px", flex: 1 }} onSubmit={handleSearch}>
            <input
              id="inventory-search"
              value={inputQ}
              onChange={e => setInputQ(e.target.value)}
              placeholder="Search products..."
              className="input-field"
              style={{ maxWidth: "280px" }}
            />
            <button type="submit" className="btn-ghost">Search</button>
          </form>
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            {(["all", "in_stock", "low", "critical"] as const).map(f => (
              <button
                key={f}
                className={`filter-pill${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "in_stock" ? "In Stock" : f === "low" ? "Low" : "Critical"}
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="input-field"
              style={{ maxWidth: "160px", fontSize: "12px" }}
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
              {uncategorizedCount > 0 && <option value="__uncategorized__">Uncategorized</option>}
            </select>
          )}
          <ExportButton isManager={isManager} />
          <button
            className="btn-ghost"
            onClick={() => setViewMode(viewMode === "table" ? "gallery" : "table")}
            title={viewMode === "table" ? "Gallery view" : "Table view"}
            style={{ padding: "5px 10px" }}
          >
            {viewMode === "table" ? <LayoutGrid size={14} /> : <LayoutList size={14} />}
          </button>
          <Link href="/add-product" className="btn-accent">
            <Plus style={{ width: "12px", height: "12px" }} /> Add Product
          </Link>
        </div>

        {/* Breadcrumb / count row */}
        <div style={{
          padding: "7px 16px", borderBottom: "1px solid var(--border-dim)",
          fontSize: "11px", color: "var(--text-3)",
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          {categoryFilter !== "all" && (
            <>
              <button
                onClick={() => setCategoryFilter("all")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "11px", padding: 0 }}
              >
                All Items
              </button>
              <ChevronRight size={10} />
              <span style={{ color: "var(--text-2)", fontWeight: 500 }}>
                {categoryFilter === "__uncategorized__" ? "Uncategorized" : categoryFilter}
              </span>
              <span style={{ marginLeft: "4px" }}>·</span>
            </>
          )}
          <span>{itemCount}</span>
        </div>

        {/* Table / Gallery */}
        <div style={{ flex: 1, overflow: "auto", opacity: isLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
          {viewMode === "gallery"
            ? <GalleryView items={items} onAdjust={handleAdjust} onDelete={handleDelete} />
            : <InventoryTable items={items} onDelete={handleDelete} onUpdate={handleUpdate} />
          }
        </div>

        {totalPages > 1 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-dim)" }}>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseUrl="/inventory"
              searchParams={{ q, pageSize: String(pageSize) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
