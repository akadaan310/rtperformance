"use client";
/**
 * Single-series charts in the workspace accent. Every chart ships a text summary, an optional data table,
 * hover tooltips with large hit targets, recessive axes, and an intentional empty state.
 * Two measures with different scales are never combined on one axis — they get separate charts.
 */
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Serializable value formats (server components cannot pass functions to client charts). */
export type ValueFormat = "integer" | "decimal";

function fmt(v: number, format?: ValueFormat): string {
  return format === "integer" ? Math.round(v).toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export interface ChartPoint {
  label: string;
  value: number | null;
}

const AXIS = { stroke: "#55555c", fontSize: 11, tickLine: false, axisLine: false } as const;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const yTick = (v: number) => compact.format(v);

function TooltipBox({ active, payload, label, unit, format }: { active?: boolean; payload?: { value: number }[]; label?: string; unit?: string; format?: ValueFormat }) {
  if (!active || !payload?.length || payload[0]?.value == null) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xs border border-ink-600 bg-ink-850 px-3 py-2 text-xs shadow-lift">
      <p className="text-stone-400">{label}</p>
      <p className="mt-0.5 font-semibold text-ivory-50" data-numeric>
        {fmt(v, format)} {unit}
      </p>
    </div>
  );
}

function ChartFrame({ title, summary, points, unit, children, height, format }: { title: string; summary: string; points: ChartPoint[]; unit?: string; children: React.ReactNode; height: number; format?: ValueFormat }) {
  const [table, setTable] = useState(false);
  const id = useId();
  return (
    <figure aria-labelledby={`${id}-t`} className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <figcaption id={`${id}-t`} className="text-sm font-semibold text-ivory-100">
          {title}
          <span className="sr-only">. {summary}</span>
        </figcaption>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-[11px] uppercase tracking-[0.14em] text-stone-500 hover:text-accent" aria-expanded={table}>
          {table ? "Chart" : "Table"}
        </button>
      </div>
      {table ? (
        <div className="scrollbar-thin max-h-64 overflow-auto rounded-xs border border-ink-700">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-850 text-stone-400">
              <tr>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">{unit ? `Value (${unit})` : "Value"}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-t border-ink-800">
                  <td className="px-3 py-1.5 text-stone-300">{p.label}</td>
                  <td className="px-3 py-1.5 text-right text-ivory-100">{p.value === null ? "—" : fmt(p.value, format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} aria-hidden>
          {children}
        </div>
      )}
      <p className="mt-2 text-xs text-stone-500">{summary}</p>
    </figure>
  );
}

export function TrendLine({ title, points, unit, summary, height = 200, format }: { title: string; points: ChartPoint[]; unit?: string; summary: string; height?: number; format?: ValueFormat }) {
  const data = points.filter((p) => p.value !== null);
  if (data.length < 2) return <ChartEmpty title={title} message="Needs at least two logged sessions to show a trend." />;
  return (
    <ChartFrame title={title} summary={summary} points={points} unit={unit} height={height} format={format}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#2c2c31" strokeDasharray="0" />
          <XAxis dataKey="label" {...AXIS} minTickGap={24} />
          <YAxis {...AXIS} width={44} domain={["auto", "auto"]} tickFormatter={yTick} />
          <Tooltip content={<TooltipBox unit={unit} format={format} />} cursor={{ stroke: "#55555c", strokeWidth: 1 }} />
          <Line type="monotone" dataKey="value" stroke="var(--brand-accent)" strokeWidth={2} dot={{ r: 4, fill: "#111113", stroke: "var(--brand-accent)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "#111113", strokeWidth: 2, fill: "var(--brand-accent)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BarSeries({ title, points, unit, summary, height = 180, format }: { title: string; points: ChartPoint[]; unit?: string; summary: string; height?: number; format?: ValueFormat }) {
  if (!points.some((p) => (p.value ?? 0) > 0)) return <ChartEmpty title={title} message="Nothing logged in this period yet." />;
  return (
    <ChartFrame title={title} summary={summary} points={points} unit={unit} height={height} format={format}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#2c2c31" />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={44} allowDecimals={false} tickFormatter={yTick} />
          <Tooltip content={<TooltipBox unit={unit} format={format} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" fill="var(--brand-accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ChartEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-ivory-100">{title}</p>
      <div className="flex h-36 items-center justify-center rounded-xs border border-dashed border-ink-700 px-6 text-center text-xs text-stone-500">{message}</div>
    </div>
  );
}
