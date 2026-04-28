"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function UserButtonClient({
  showUserInfo,
  name,
  email,
  avatar,
}: {
  showUserInfo?: boolean;
  name?: string;
  email?: string;
  avatar?: string | null;
}) {
  if (!showUserInfo) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
      {/* User info — non-clickable */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", borderRadius: 6,
        flex: 1, minWidth: 0, overflow: "hidden",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: "var(--accent)", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {avatar
            ? <Image src={avatar} alt={name ?? ""} width={26} height={26} style={{ objectFit: "cover", borderRadius: "50%" }} />
            : <span style={{ fontSize: 11, fontWeight: 700, color: "#000" }}>
                {(name || email || "?").charAt(0).toUpperCase()}
              </span>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {name && (
            <div style={{
              fontSize: 12, fontWeight: 600, color: "var(--text-1)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{name}</div>
          )}
          <div style={{
            fontSize: 10, color: "var(--text-3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{email}</div>
        </div>
      </div>

      {/* Sign out button */}
      <Link
        href="/handler/sign-out"
        title="Sign out"
        style={{
          flexShrink: 0, width: 28, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 6, color: "var(--text-3)",
          transition: "background 0.12s, color 0.12s",
          textDecoration: "none",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-1)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-3)";
        }}
      >
        <LogOut size={13} strokeWidth={1.8} />
      </Link>
    </div>
  );
}
