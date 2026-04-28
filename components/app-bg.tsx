export default function AppBg() {
  return (
    <>
      {/* Vignette — pure CSS, zero GPU cost */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 0%, rgba(10,10,12,0.85) 100%)",
        contain: "strict",
      }} />

      {/* Grid — CSS background, no blur */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        contain: "strict",
      }} />
    </>
  );
}
