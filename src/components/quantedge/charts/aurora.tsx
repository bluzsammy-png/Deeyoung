"use client";

// DEEYOUNG PRO — Cinematic landing backdrop (Graphics 2.0).
// Product-native: a live "market constellation" — nodes drift like tickers,
// connections like correlation edges, cursor acts like a liquidity magnet.
// Pure canvas 2D, DPR-aware, pauses when the tab is hidden, honors
// prefers-reduced-motion. No WebGL, no libraries — product-native per §37.

import { useEffect, useRef } from "react";

interface Node {
  x: number; y: number; vx: number; vy: number; r: number; hue: 0 | 1 | 2;
}

export function AuroraBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    let nodes: Node[] = [];
    const mouse = { x: -9999, y: -9999, active: false };

    const ACCENT = ["16,185,129", "110,231,183", "240,185,11"]; // pos, mint, gold

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(88, Math.round((w * h) / 16000));
      nodes = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 0.8 + Math.random() * 1.5,
        hue: (Math.random() < 0.72 ? 0 : Math.random() < 0.8 ? 1 : 2) as 0 | 1 | 2,
      }));
    };

    const LINK = 128;
    const step = () => {
      ctx.clearRect(0, 0, w, h);

      // edges (correlation lines)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const t = 1 - Math.sqrt(d2) / LINK;
            ctx.strokeStyle = `rgba(16,185,129,${(t * 0.16).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // cursor liquidity lines
        if (mouse.active) {
          const dx = a.x - mouse.x, dy = a.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 170 * 170) {
            const t = 1 - Math.sqrt(d2) / 170;
            ctx.strokeStyle = `rgba(110,231,183,${(t * 0.35).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (const n of nodes) {
        // gentle pull toward cursor — the "liquidity magnet"
        if (mouse.active) {
          const dx = mouse.x - n.x, dy = mouse.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < 200 && d > 24) {
            n.vx += (dx / d) * 0.012;
            n.vy += (dy / d) * 0.012;
          }
        }
        n.vx *= 0.985; n.vy *= 0.985;
        // keep a minimum drift so the field never freezes
        if (Math.abs(n.vx) < 0.05) n.vx += (Math.random() - 0.5) * 0.02;
        if (Math.abs(n.vy) < 0.05) n.vy += (Math.random() - 0.5) * 0.02;
        n.x += n.vx; n.y += n.vy;
        if (n.x < -12) n.x = w + 12; else if (n.x > w + 12) n.x = -12;
        if (n.y < -12) n.y = h + 12; else if (n.y > h + 12) n.y = -12;

        const c = ACCENT[n.hue];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c},0.75)`;
        ctx.shadowColor = `rgba(${c},0.9)`;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // cursor halo
      if (mouse.active) {
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 90);
        grad.addColorStop(0, "rgba(16,185,129,0.10)");
        grad.addColorStop(1, "rgba(16,185,129,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(mouse.x - 90, mouse.y - 90, 180, 180);
      }

      raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };
    const onLeave = () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduced) raf = requestAnimationFrame(step);
    };

    build();
    if (reduced) {
      // static constellation for reduced motion — one frame, no loop
      step();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(step);
    }

    const ro = new ResizeObserver(build);
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* aurora blobs */}
      <div className="qe-aurora qe-aurora-a absolute -top-44 left-[8%] h-[420px] w-[620px] rounded-full opacity-70" />
      <div className="qe-aurora qe-aurora-b absolute top-[22%] right-[4%] h-[380px] w-[520px] rounded-full opacity-60" />
      <div className="qe-aurora qe-aurora-c absolute bottom-[-18%] left-[28%] h-[460px] w-[720px] rounded-full opacity-50" />
      {/* particle constellation */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* vignette to keep text legible */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 62% at 50% 8%, transparent 40%, rgba(7,9,13,0.72) 100%)" }} />
    </div>
  );
}
