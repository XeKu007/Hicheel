"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ChartData { week: string; products: number; }

export default function ProductsChartInner({ data, role }: { data: ChartData[]; role?: string }) {
  const isManager = role === "MANAGER" || role === "SUPER_ADMIN";
  const strokeColor = isManager ? "#C8F000" : "#0070f6";
  const fillColor   = isManager ? "rgba(200,240,0,0.06)" : "rgba(0,112,246,0.06)";
  const dotColor    = isManager ? "#C8F000" : "#0070f6";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="week" stroke="transparent"
          tick={{ fill: "#404040", fontSize: 9, fontFamily: "var(--font-mono)" }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          stroke="transparent"
          tick={{ fill: "#404040", fontSize: 9, fontFamily: "var(--font-mono)" }}
          tickLine={false} axisLine={false} allowDecimals={false}
        />
        <Area
          type="monotone" dataKey="products"
          stroke={strokeColor} strokeWidth={1.5}
          fill={fillColor}
          dot={false}
          activeDot={{ fill: dotColor, r: 3, strokeWidth: 0 }}
        />
        <Tooltip
          contentStyle={{
            background: "#1C1C1C", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)",
            color: "#F0F0EB", padding: "6px 10px",
          }}
          labelStyle={{ color: "#808078", marginBottom: 2 }}
          cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
