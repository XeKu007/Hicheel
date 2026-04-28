/**
 * CSS-only animated background — premium dark aesthetic.
 * Optimized: reduced orb count, no filter:blur on animated elements,
 * uses pre-blurred radial-gradient instead for GPU efficiency.
 */
export default function CssBg({ blur = 0 }: { blur?: number }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "#080810", contain: "strict" }}>

        {/* Primary blue orb — top left (static gradient, no filter:blur) */}
        <div style={{
          position: "absolute", width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,112,246,0.12) 0%, rgba(0,80,200,0.05) 40%, transparent 70%)",
          top: "-10%", left: "-5%",
          animation: "cssBg1 20s ease-in-out infinite",
          willChange: "transform",
        }} />

        {/* Lime orb — top right */}
        <div style={{
          position: "absolute", width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,240,0,0.08) 0%, rgba(160,200,0,0.03) 45%, transparent 70%)",
          top: "5%", right: "-8%",
          animation: "cssBg2 26s ease-in-out infinite",
          willChange: "transform",
        }} />

        {/* Purple orb — center (static, no animation — saves GPU) */}
        <div style={{
          position: "absolute", width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(120,60,220,0.07) 0%, rgba(80,40,180,0.03) 50%, transparent 70%)",
          top: "30%", left: "35%",
        }} />

        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }} />

        {/* Vignette */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 100% 90% at 50% 50%, transparent 10%, rgba(8,8,16,0.7) 70%, rgba(8,8,16,0.95) 100%)",
        }} />

        {/* Top edge fade */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "30%",
          background: "linear-gradient(to bottom, rgba(8,8,16,0.6) 0%, transparent 100%)",
        }} />

        {blur > 0 && (
          <div style={{
            position: "absolute", inset: 0,
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
          }} />
        )}
      </div>

      <style>{`
        @keyframes cssBg1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(50px,-40px) scale(1.06); }
          66% { transform: translate(-30px,30px) scale(0.96); }
        }
        @keyframes cssBg2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40% { transform: translate(-60px,35px) scale(1.08); }
          70% { transform: translate(25px,-25px) scale(0.94); }
        }
      `}</style>
    </>
  );
}
