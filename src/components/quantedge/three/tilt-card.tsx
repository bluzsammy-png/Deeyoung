"use client";

// DEEYOUNG PRO — CSS 3D tilt wrapper. Mouse-reactive perspective cards
// used across the landing surface. Respects reduced motion via CSS (.qe-tilt override).

import { useRef, type ReactNode } from "react";

export function TiltCard({
  children,
  className = "",
  maxTilt = 8,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) translateZ(6px)`;
      el.style.setProperty("--mx", `${(px * 100 + 50).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100 + 50).toFixed(1)}%`);
    });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(0)";
  };

  return (
    <div className={`qe-tilt-stage ${className}`}>
      <div ref={ref} className="qe-tilt h-full w-full" onMouseMove={onMove} onMouseLeave={onLeave}>
        {children}
      </div>
    </div>
  );
}
