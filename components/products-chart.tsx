"use client";

import dynamic from "next/dynamic";

const ProductsChartInner = dynamic(() => import("@/components/products-chart-inner"), {
  ssr: false,
  loading: () => <div style={{ height: "100%", background: "transparent" }} />,
});

interface ChartData { week: string; products: number; }

export default function ProductChart({ data, role }: { data: ChartData[]; role?: string }) {
  return <ProductsChartInner data={data} role={role} />;
}
