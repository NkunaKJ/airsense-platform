"use client";

import { useEffect, useRef, useState } from "react";
import { BANDS, bandFor, type HistoryPoint } from "@/lib/api";

// "Mon 12 Oct 2026"
function tipDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// "Oct 2026" for long ranges, "12 Oct" for short ones
function axisDate(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return withYear
    ? dt.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
    : dt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export default function TrendChart({ points, longRange }: { points: HistoryPoint[]; longRange: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  // Draw at the real size of the space, so text stays readable on a phone.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const n = points.length;
  if (n < 2) return <p className="loading">Not enough days to draw a chart.</p>;

  const W = Math.max(280, width);
  const H = W < 480 ? 250 : 300;
  const M = { l: 46, r: 14, t: 14, b: 32 };
  const top = Math.max(60, Math.ceil(Math.max(...points.map((p) => p.pm2_5)) / 10) * 10);
  const x = (i: number) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / top) * (H - M.t - M.b);
  const step = top > 100 ? 20 : 10;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const limits = BANDS.filter((b) => b.max !== null && b.max < top);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.pm2_5).toFixed(1)}`).join(" ");
  const labelCount = W < 480 ? 4 : 5;
  const labelIdx = Array.from({ length: labelCount }, (_, i) => Math.round((i / (labelCount - 1)) * (n - 1)));

  function pick(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) * (W / rect.width);
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  function key(e: React.KeyboardEvent<SVGSVGElement>) {
    const at = hover ?? n - 1;
    const next =
      e.key === "ArrowLeft" ? at - 1 : e.key === "ArrowRight" ? at + 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setHover(Math.min(n - 1, Math.max(0, next)));
  }

  const hp = hover === null ? null : points[hover];
  const band = hp ? bandFor(hp.pm2_5) : null;

  // The box sits above the point, or below it near the top, and stays inside the chart sideways.
  let tipStyle: React.CSSProperties = {};
  if (hp && hover !== null) {
    const px = x(hover);
    const py = y(hp.pm2_5);
    const sideways = px < 90 ? "0%" : px > W - 90 ? "-100%" : "-50%";
    const vertical = py < 110 ? "14px" : "calc(-100% - 14px)";
    tipStyle = { left: px, top: py, transform: `translate(${sideways}, ${vertical})` };
  }

  return (
    <div className="tchart" ref={wrap}>
      <svg
        className="tchart__svg"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="img"
        aria-label={`Daily PM2.5 from ${points[0].date} to ${points[n - 1].date}. Use the left and right arrow keys to read each day.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={key}
        onBlur={() => setHover(null)}
      >
        {ticks.map((t) => (
          <text key={t} x={M.l - 8} y={y(t) + 4} textAnchor="end" className="tchart__text">
            {t}
          </text>
        ))}
        <text
          transform={`translate(13 ${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="tchart__text tchart__text--axis"
        >
          PM2.5 (µg/m³)
        </text>

        {limits.map((b) => (
          <g key={b.name}>
            <line x1={M.l} x2={W - M.r} y1={y(b.max!)} y2={y(b.max!)} className="tchart__limit" />
            <text x={M.l + 6} y={y(b.max!) - 5} className="tchart__limit-label" style={{ fill: b.text }}>
              {b.name}: up to {b.max}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} className="tchart__base" />

        {labelIdx.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 9}
            textAnchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"}
            className="tchart__text"
          >
            {axisDate(points[i].date, longRange)}
          </text>
        ))}

        <path d={path} className="tchart__line" style={{ strokeWidth: n > 200 ? 1.5 : 2 }} />

        {hp && hover !== null && band && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={y(0)} className="tchart__cursor" />
            <circle cx={x(hover)} cy={y(hp.pm2_5)} r={4.5} className="tchart__dot" style={{ fill: band.colour }} />
          </g>
        )}
      </svg>

      {hp && band && (
        <div className="tchart__tip" style={tipStyle} role="presentation">
          <dl>
            <dt>Date</dt>
            <dd>{tipDate(hp.date)}</dd>
            <dt>Air quality</dt>
            <dd>
              <span className="tchart__swatch" style={{ background: band.colour }} />
              {band.name}
            </dd>
            <dt>PM2.5</dt>
            <dd>{hp.pm2_5.toFixed(1)} µg/m³</dd>
          </dl>
        </div>
      )}

      <p className="tchart__hint">{!hp && "Move over the chart (or touch it) to read a day."}</p>
      <p className="tchart__sr" aria-live="polite">
        {hp && band ? `${tipDate(hp.date)}: ${hp.pm2_5.toFixed(1)} micrograms per cubic metre, ${band.name}.` : ""}
      </p>
    </div>
  );
}