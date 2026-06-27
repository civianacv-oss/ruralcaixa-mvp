"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";

export default function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div style={{
        flex: 1,
        marginLeft: open ? 260 : 0,
        transition: "margin-left 0.25s ease",
        minWidth: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "8px 16px", background: "#1a3a1a", color: "#e8f5e8",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: "none", border: "none", color: "#e8f5e8", fontSize: 20, cursor: "pointer", padding: 4 }}
          >
            ☰
          </button>
          <span style={{ fontSize: 13, opacity: 0.7 }}>RuralCaixa</span>
        </div>
        {children}
      </div>
    </div>
  );
}
