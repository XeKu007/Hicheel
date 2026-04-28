"use client";

import { useRef, useCallback, type ReactNode, type CSSProperties } from "react";

interface TiltCardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  intensity?: number;
}

export default function TiltCard({ children, style, className, intensity = 12 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Throttle via rAF — only one update per frame
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width  - 0.5;
      const y = (e.clientY - rect.top)  / rect.height - 0.5;
      el.style.transform = `perspective(600px) rotateX(${-y * intensity}deg) rotateY(${x * intensity}deg) scale(1.02)`;
      el.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
      el.style.setProperty("--my", `${(y + 0.5) * 100}%`);
    });
  }, [intensity]);

  const onMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)";
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        transition: "transform 0.15s ease",
        transformStyle: "preserve-3d",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Glare overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
        background: "radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.07) 0%, transparent 60%)",
        borderRadius: "inherit",
      }} />
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}
