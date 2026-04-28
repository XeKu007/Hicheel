"use client";

import { useState } from "react";

export default function GrafanaEmbed() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const url = process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL;

  if (!url) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100%", gap: 12, color: "var(--text-3)",
      }}>
        <div style={{ fontSize: 13 }}>Monitoring unavailable</div>
        <div style={{ fontSize: 11 }}>Set <code>NEXT_PUBLIC_GRAFANA_EMBED_URL</code> to enable.</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Loading skeleton */}
      {!loaded && !error && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, padding: 20,
        }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              background: "var(--bg-raised)", borderRadius: "var(--r-md)",
              border: "1px solid var(--border-dim)",
              animation: "pulse 1.5s ease-in-out infinite",
              opacity: 0.6,
            }} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12,
        }}>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>Monitoring unavailable</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>
            Grafana may have blocked embedding. Open in a new tab instead.
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-accent">
            Open Grafana Dashboard ↗
          </a>
          <button
            className="btn-ghost"
            onClick={() => { setError(false); setLoaded(false); setRetryKey(k => k + 1); }}
          >
            Retry embed
          </button>
        </div>
      )}

      {/* Grafana iframe */}
      {!error && (
        <iframe
          key={retryKey}
          src={url}
          style={{
            width: "100%", height: "100%", border: "none",
            opacity: loaded ? 1 : 0, transition: "opacity 0.3s",
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          title="Grafana Monitoring Dashboard"
        />
      )}
    </div>
  );
}
