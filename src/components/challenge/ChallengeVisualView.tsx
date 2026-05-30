"use client";

import type { ChallengeVisual } from "@/lib/education";

const STROKE = "#7a4f0e"; // accent-deep
const FILL = "#fff6da"; // soft paper
const SHADE = "#caa24a"; // muted gold

/**
 * Renders a challenge's visual: emoji glyphs (counting), an SVG regular polygon
 * (geometry — real heptagons/octagons, not emoji), a labeled rectangle /
 * triangle (area & perimeter), or a divided bar (fractions).
 */
export function ChallengeVisualView({
  visual,
  size = "lg",
}: {
  visual: ChallengeVisual;
  size?: "lg" | "sm";
}) {
  if (visual.kind === "glyphs") {
    if (visual.layout === "single") {
      return (
        <span className={size === "lg" ? "text-7xl sm:text-8xl" : "text-3xl"}>
          {visual.glyphs[0]}
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {visual.glyphs.map((g, i) => (
          <span key={i} className={size === "lg" ? "text-4xl sm:text-5xl" : "text-xl"}>
            {g}
          </span>
        ))}
      </div>
    );
  }

  const px = size === "lg" ? 150 : 64;
  const fontSize = size === "lg" ? 14 : 9;

  if (visual.kind === "polygon") {
    const r = px * 0.42;
    const cx = px / 2;
    const cy = px / 2;
    const pts = Array.from({ length: visual.sides }, (_, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / visual.sides;
      return `${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`;
    }).join(" ");
    return (
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <polygon points={pts} fill={FILL} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
    );
  }

  if (visual.kind === "rect") {
    const pad = size === "lg" ? 26 : 16;
    const maxSide = px - pad * 2;
    const longer = Math.max(visual.w, visual.h);
    const rw = (visual.w / longer) * maxSide;
    const rh = (visual.h / longer) * maxSide;
    const x = (px - rw) / 2;
    const y = (px - rh) / 2;
    return (
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <rect x={x} y={y} width={rw} height={rh} fill={FILL} stroke={STROKE} strokeWidth={2.5} rx={3} />
        {visual.showDims && (
          <>
            <text x={px / 2} y={y + rh + fontSize + 2} textAnchor="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
              {visual.w}
            </text>
            <text x={x - 4} y={px / 2} textAnchor="end" dominantBaseline="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
              {visual.h}
            </text>
          </>
        )}
      </svg>
    );
  }

  if (visual.kind === "triangle") {
    const pad = size === "lg" ? 26 : 16;
    const baseY = px - pad;
    const apexX = px / 2;
    const apexY = pad;
    const halfBase = (px - pad * 2) / 2;
    return (
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <polygon
          points={`${apexX - halfBase},${baseY} ${apexX + halfBase},${baseY} ${apexX},${apexY}`}
          fill={FILL}
          stroke={STROKE}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* height line */}
        <line x1={apexX} y1={apexY} x2={apexX} y2={baseY} stroke={STROKE} strokeWidth={1} strokeDasharray="3 3" />
        <text x={apexX} y={baseY + fontSize + 2} textAnchor="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
          {visual.base}
        </text>
        <text x={apexX + 4} y={(apexY + baseY) / 2} dominantBaseline="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
          {visual.height}
        </text>
      </svg>
    );
  }

  // bar fraction — `den` segments, first `shaded` filled.
  const barW = size === "lg" ? Math.min(280, 40 * visual.den) : 64;
  const barH = size === "lg" ? 44 : 18;
  const seg = barW / visual.den;
  return (
    <svg width={barW} height={barH} viewBox={`0 0 ${barW} ${barH}`} aria-hidden>
      {Array.from({ length: visual.den }, (_, i) => (
        <rect
          key={i}
          x={i * seg}
          y={0}
          width={seg}
          height={barH}
          fill={i < visual.shaded ? SHADE : FILL}
          stroke={STROKE}
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
