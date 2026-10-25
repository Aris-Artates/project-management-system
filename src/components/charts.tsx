"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small SVG charts. Marks carry series color; all text uses text tokens.
// Every chart has a hover tooltip and a table view.

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

type Fmt = (n: number) => string;
// Units are names, not functions, so server pages can pass them to these client charts.
export type Unit = "count" | "hours";
const compact: Fmt = (n) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n * 10) / 10));
const FORMATS: Record<Unit, Fmt> = { count: compact, hours: (n) => `${compact(n)}h` };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: i.color, height: 3 }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full tabular-nums">
          <thead className="text-muted">
            <tr>
              {head.map((h) => (
                <th key={h} className="border-b border-line px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-line px-2 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// Positioned in percent of the chart width so it follows responsive resizing.
function Tooltip({ xPct, children }: { xPct: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-card"
      style={{ left: `clamp(72px, ${xPct}%, calc(100% - 72px))` }}
    >
      {children}
    </div>
  );
}

const W = 600;

export function LineChart({
  labels,
  series,
  height = 200,
  unit = "count",
}: {
  labels: string[];
  series: { name: string; values: number[]; color?: string }[];
  height?: number;
  unit?: Unit;
}) {
  const format = FORMATS[unit];
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length < 2 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }));
  const ticks = [0, max / 2, max];
  const every = Math.ceil(labels.length / 8);

  return (
    <div>
      <Legend items={colored} />
      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={colored.map((s) => s.name).join(", ")}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - pad.l) / iw) * (labels.length - 1));
            setHover(Math.max(0, Math.min(labels.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--muted)] text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 || i === labels.length - 1 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                {l}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--chart-axis)" strokeWidth={1} />}
          {colored.map((s) => (
            <path
              key={s.name}
              d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {colored.map((s) => {
            const i = hover ?? s.values.length - 1;
            return <circle key={s.name} cx={x(i)} cy={y(s.values[i] ?? 0)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
          })}
        </svg>
        {hover !== null && (
          <Tooltip xPct={(x(hover) / W) * 100}>
            <p className="font-medium">{labels[hover]}</p>
            {colored.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 text-muted">
                <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                {s.name}: <span className="text-fg">{format(s.values[hover] ?? 0)}</span>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
      <TableView head={["", ...colored.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...colored.map((s) => format(s.values[i] ?? 0))])} />
    </div>
  );
}

export function ColumnChart({
  data,
  height = 180,
  unit = "count",
  color = SERIES[0]!,
  name = "Value",
}: {
  data: { label: string; value: number }[];
  height?: number;
  unit?: Unit;
  color?: string;
  name?: string;
}) {
  const format = FORMATS[unit];
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 36, r: 8, t: 12, b: 24 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full overflow-visible" role="img" aria-label={name} onMouseLeave={() => setHover(null)}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--muted)] text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const h = Math.max(0, ih - (y(d.value) - pad.t));
            const r = Math.min(4, h / 2, bw / 2);
            const top = pad.t + ih - h;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${cx - bw / 2},${pad.t + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${pad.t + ih} Z`}
                    fill={color}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <Tooltip xPct={((pad.l + band * hover + band / 2) / W) * 100}>
            <p className="font-medium">{data[hover]!.label}</p>
            <p className="text-muted">
              {name}: <span className="text-fg">{format(data[hover]!.value)}</span>
            </p>
          </Tooltip>
        )}
      </div>
      <TableView head={["", name]} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  );
}

// One 100% bar split into segments (with 2px surface gaps), legend with values below.
export function StackedBar({ segments, unit = "count" }: { segments: { label: string; value: number; color: string }[]; unit?: Unit }) {
  const format = FORMATS[unit];
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2">
        {segments.map((s, i) =>
          s.value > 0 ? (
            <div
              key={s.label}
              title={`${s.label}: ${format(s.value)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={cn("h-full transition-opacity first:rounded-l-full last:rounded-r-full", hover !== null && hover !== i && "opacity-50")}
              style={{ width: `${(s.value / Math.max(1, total)) * 100}%`, background: s.color }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="text-muted tabular-nums">{format(s.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Ranked horizontal bars with the value at the tip.
export function BarList({ rows, unit = "count", color = SERIES[0]! }: { rows: { label: ReactNode; key: string; value: number }[]; unit?: Unit; color?: string }) {
  const format = FORMATS[unit];
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${format(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-r-[4px] rounded-l-sm" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          <span className="tabular-nums text-muted">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
