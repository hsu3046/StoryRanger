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

  if (visual.kind === "shape") {
    const cx = px / 2;
    const cy = px / 2;
    if (visual.shape === "circle") {
      return (
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
          <circle cx={cx} cy={cy} r={px * 0.4} fill={FILL} stroke={STROKE} strokeWidth={2.5} />
        </svg>
      );
    }
    if (visual.shape === "oval") {
      return (
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
          <ellipse cx={cx} cy={cy} rx={px * 0.43} ry={px * 0.3} fill={FILL} stroke={STROKE} strokeWidth={2.5} />
        </svg>
      );
    }
    if (visual.shape === "star") {
      const R = px * 0.43;
      const rin = R * 0.4;
      const pts = Array.from({ length: 10 }, (_, i) => {
        const ang = -Math.PI / 2 + (Math.PI * i) / 5;
        const rad = i % 2 === 0 ? R : rin;
        return `${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`;
      }).join(" ");
      return (
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
          <polygon points={pts} fill={FILL} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" />
        </svg>
      );
    }
    // heart — drawn in a fixed 32×29 path space, scaled to px.
    return (
      <svg width={px} height={px} viewBox="0 0 32 29" aria-hidden>
        <path
          d="M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,20.6c6.5-8.7,16-11.2,16-20.6C32,3.8,28.2,0,23.6,0z"
          fill={FILL}
          stroke={STROKE}
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (visual.kind === "rect") {
    // Content-fit canvas: size the SVG to the rectangle's own aspect ratio (+
    // label room) instead of a fixed square, so a flat rect (e.g. 14×5) doesn't
    // sit in a mostly-empty box. Scale the LONGER side to a larger target so the
    // figure actually fills the space.
    const target = size === "lg" ? 240 : 90;
    const longer = Math.max(visual.w, visual.h);
    const rw = (visual.w / longer) * target;
    const rh = (visual.h / longer) * target;
    const lab = visual.showDims ? fontSize + 8 : 4; // room for edge labels
    const x = lab;
    const y = 4;
    const W = x + rw + 4;
    const H = y + rh + lab;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {/* Sharp right-angle corners — no rx. */}
        <rect x={x} y={y} width={rw} height={rh} fill={FILL} stroke={STROKE} strokeWidth={2.5} />
        {visual.showDims && (
          <>
            <text x={x + rw / 2} y={y + rh + fontSize + 2} textAnchor="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
              {visual.w}
            </text>
            <text x={x - 4} y={y + rh / 2} textAnchor="end" dominantBaseline="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
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
    const hLabel = String(visual.height);
    const chipW = hLabel.length * fontSize * 0.72 + 5;
    const chipH = fontSize + 4;
    const hy = (apexY + baseY) / 2;
    return (
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
        <polygon
          points={`${apexX - halfBase},${baseY} ${apexX + halfBase},${baseY} ${apexX},${apexY}`}
          fill={FILL}
          stroke={STROKE}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* Altitude line (dashed) illustrates "height". */}
        <line x1={apexX} y1={apexY} x2={apexX} y2={baseY} stroke={STROKE} strokeWidth={1} strokeDasharray="3 3" />
        {/* Base label, below the figure. */}
        <text x={apexX} y={baseY + fontSize + 3} textAnchor="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
          {visual.base}
        </text>
        {/* Height label centred on the altitude, on a fill chip so it stays
            legible over the dashed line. */}
        <rect x={apexX - chipW / 2} y={hy - chipH / 2} width={chipW} height={chipH} fill={FILL} />
        <text x={apexX} y={hy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fill={STROKE} fontWeight="700">
          {hLabel}
        </text>
      </svg>
    );
  }

  // bar fraction — `den` segments, first `shaded` filled. Outer border and
  // internal dividers share one stroke width so they look uniform.
  const barW = size === "lg" ? Math.min(280, 40 * visual.den) : 64;
  const barH = size === "lg" ? 44 : 18;
  const bw = 2;
  const seg = (barW - bw) / visual.den;
  return (
    <svg width={barW} height={barH} viewBox={`0 0 ${barW} ${barH}`} aria-hidden>
      {/* fills only (no per-segment stroke) */}
      {Array.from({ length: visual.den }, (_, i) => (
        <rect
          key={i}
          x={bw / 2 + i * seg}
          y={bw / 2}
          width={seg}
          height={barH - bw}
          fill={i < visual.shaded ? SHADE : FILL}
        />
      ))}
      {/* internal dividers */}
      {Array.from({ length: visual.den - 1 }, (_, i) => (
        <line
          key={i}
          x1={bw / 2 + (i + 1) * seg}
          y1={bw / 2}
          x2={bw / 2 + (i + 1) * seg}
          y2={barH - bw / 2}
          stroke={STROKE}
          strokeWidth={bw}
        />
      ))}
      {/* outer border — same width as the dividers */}
      <rect x={bw / 2} y={bw / 2} width={barW - bw} height={barH - bw} fill="none" stroke={STROKE} strokeWidth={bw} />
    </svg>
  );
}
