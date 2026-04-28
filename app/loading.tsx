"use client";

export default function Loading() {
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .skel {
          background: var(--bg-raised);
          border-radius: 3px;
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="app-shell">
        {/* Rail skeleton */}
        <div style={{
          width: "52px", flexShrink: 0,
          background: "var(--bg-base)",
          borderRight: "1px solid var(--border-dim)",
          display: "flex", flexDirection: "column",
          alignItems: "center", padding: "12px 0", gap: "6px",
        }}>
          <div className="skel" style={{ width: "26px", height: "26px", borderRadius: "5px", marginBottom: "10px" }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skel" style={{ width: "34px", height: "34px", borderRadius: "7px" }} />
          ))}
        </div>

        {/* Content skeleton */}
        <div className="content-wrap">
          {/* Topbar */}
          <div className="topbar">
            <div className="skel" style={{ width: "60px", height: "10px" }} />
            <div className="skel" style={{ width: "4px", height: "10px" }} />
            <div className="skel" style={{ width: "80px", height: "10px" }} />
          </div>

          {/* Page content */}
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Toolbar skeleton */}
            <div style={{ display: "flex", gap: "8px", paddingBottom: "12px", borderBottom: "1px solid var(--border-dim)" }}>
              <div className="skel" style={{ width: "200px", height: "28px" }} />
              <div className="skel" style={{ width: "60px", height: "28px" }} />
              <div className="skel" style={{ width: "50px", height: "28px", marginLeft: "auto" }} />
              <div className="skel" style={{ width: "80px", height: "28px" }} />
            </div>

            {/* Table rows skeleton */}
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid var(--border-dim)" }}>
                <div className="skel" style={{ width: "160px", height: "12px" }} />
                <div className="skel" style={{ width: "40px", height: "12px", marginLeft: "auto" }} />
                <div className="skel" style={{ width: "40px", height: "12px" }} />
                <div className="skel" style={{ width: "60px", height: "12px" }} />
                <div className="skel" style={{ width: "48px", height: "12px" }} />
                <div className="skel" style={{ width: "56px", height: "22px", borderRadius: "3px" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
