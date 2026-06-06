"use client";

import { Component } from "react";
import type { ReactNode } from "react";

export class Scene3DErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch() {}
  render() {
    return this.state.crashed ? this.props.fallback : this.props.children;
  }
}

export function Scene2DFallback({ phase, isGoal }: { phase: string; isGoal: boolean }) {
  return (
    <div style={{
      height: 320, background: "linear-gradient(170deg,#0a1a0a,#0d2e0d)",
      borderRadius: 14, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12,
      fontFamily: "var(--condensed)",
    }}>
      <div style={{ fontSize: 64 }}>
        {phase === "result" ? (isGoal ? "⚽" : "🧤") : "⚽"}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", letterSpacing: 1 }}>
        WebGL no disponible en este navegador
      </div>
    </div>
  );
}
