import { useState } from "react";
import { Filter, RotateCcw, X } from "lucide-react";
import { borders, colors, radius, spacing, typography } from "../tokens";
import { Button } from "./ui/Button";
import { Label, Select, TextInput } from "./ui/Input";
import type { EventFilters } from "../types";

const PRESETS = [
  { label: "Last 15 min", value: "15m" },
  { label: "Last hour", value: "1h" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7 days", value: "7d" },
  { label: "All time", value: "all" },
];

function addSince(offsetMs: number): string | undefined {
  const d = new Date(Date.now() - offsetMs);
  return d.toISOString();
}

function parsePreset(v: string): { since?: string } {
  switch (v) {
    case "15m": return { since: addSince(15 * 60_000) };
    case "1h": return { since: addSince(60 * 60_000) };
    case "24h": return { since: addSince(24 * 60 * 60_000) };
    case "7d": return { since: addSince(7 * 24 * 60 * 60_000) };
    default: return {};
  }
}

export interface FilterPanelProps {
  filters: EventFilters;
  onChange: (f: EventFilters) => void;
  onReplay?: () => void;
}

export function FilterPanel({ filters, onChange, onReplay }: FilterPanelProps) {
  const [open, setOpen] = useState(true);
  const [preset, setPreset] = useState<"15m" | "1h" | "24h" | "7d" | "all" | "custom">("24h");

  const setPartial = (patch: Partial<EventFilters>) => {
    onChange({ ...filters, page: 1, ...patch });
  };

  const onReset = () => {
    setPreset("24h");
    onChange({ ...parsePreset("24h"), sort: "timestamp_desc", page: 1, page_size: 25 });
  };

  const onPresetChange = (v: string) => {
    setPreset(v as any);
    onChange({ ...filters, since: undefined, until: undefined, page: 1, ...parsePreset(v) });
  };

  return (
    <div style={{
      background: colors.bgSurface, border: borders.base, borderRadius: radius.lg, marginBottom: spacing["5"],
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${spacing["4"]} ${spacing["5"]}`,
          background: colors.bgSurfaceElevated, border: "none", borderBottom: open ? borders.base : "none",
          color: colors.textPrimary, cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"] }}>
          <Filter size={15} color={colors.textSecondary}/>
          <span style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold }}>Filters</span>
          <div style={{ display: "flex", gap: spacing["1.5"], marginLeft: spacing["2"], flexWrap: "wrap" }}>
            <SummaryTag>Sort: {filters.sort || "timestamp desc"}</SummaryTag>
            {filters.severity?.length ? <SummaryTag>Severity: {filters.severity.join(", ")}</SummaryTag> : null}
            {filters.event_type?.length ? <SummaryTag>Types: {filters.event_type.join(", ")}</SummaryTag> : null}
            {filters.src_ip ? <SummaryTag>src_ip={filters.src_ip}</SummaryTag> : null}
            {filters.dst_ip ? <SummaryTag>dst_ip={filters.dst_ip}</SummaryTag> : null}
            {filters.acknowledged === true ? <SummaryTag>ack</SummaryTag> : filters.acknowledged === false ? <SummaryTag>unack</SummaryTag> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: spacing["2"] }}>
          <Button type="button" size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onReset(); }} icon={<RotateCcw size={13}/>}>Reset</Button>
          {onReplay && (
            <Button type="button" size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onReplay(); }}>Replay sample</Button>
          )}
        </div>
      </button>

      {open && (
        <div className="filter-grid" style={{ padding: spacing["5"], gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
          <Field span={4} label="Time range">
            <Select value={preset} onChange={(e) => onPresetChange(e.target.value)}>
              {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              {preset === "custom" && <option value="custom">Custom</option>}
            </Select>
          </Field>
          <Field span={4} label="Since (ISO UTC, optional)">
            <TextInput value={filters.since || ""} onChange={(e) => { setPreset("custom"); setPartial({ since: e.target.value || undefined }); }} placeholder="e.g. 2026-10-09T00:00:00Z"/>
          </Field>
          <Field span={4} label="Until (ISO UTC, optional)">
            <TextInput value={filters.until || ""} onChange={(e) => { setPreset("custom"); setPartial({ until: e.target.value || undefined }); }} placeholder="e.g. 2026-10-10T23:59:59Z"/>
          </Field>

          <Field span={3} label="Severity">
            <MultiSelect
              name="severity"
              options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]}
              value={filters.severity || []}
              onChange={(v) => setPartial({ severity: v })}
            />
          </Field>
          <Field span={3} label="Event type">
            <MultiSelect
              name="event_type"
              options={[
                { value: "alert", label: "Alert" }, { value: "flow", label: "Flow" },
                { value: "dns", label: "DNS" }, { value: "http", label: "HTTP" }, { value: "tls", label: "TLS" },
              ]}
              value={filters.event_type || []}
              onChange={(v) => setPartial({ event_type: v })}
            />
          </Field>
          <Field span={2} label="Protocol">
            <TextInput value={filters.proto || ""} onChange={(e) => setPartial({ proto: e.target.value || undefined })} placeholder="TCP / UDP / ICMP"/>
          </Field>
          <Field span={2} label="Source IP">
            <TextInput value={filters.src_ip || ""} onChange={(e) => setPartial({ src_ip: e.target.value || undefined })} placeholder="10.0.1.5"/>
          </Field>
          <Field span={2} label="Destination IP">
            <TextInput value={filters.dst_ip || ""} onChange={(e) => setPartial({ dst_ip: e.target.value || undefined })} placeholder="10.0.1.5"/>
          </Field>

          <Field span={3} label="Acknowledged">
            <Select
              value={filters.acknowledged === true ? "yes" : filters.acknowledged === false ? "no" : "any"}
              onChange={(e) => {
                const v = e.target.value;
                setPartial({ acknowledged: v === "any" ? undefined : (v === "yes") });
              }}
            >
              <option value="any">Any</option>
              <option value="yes">Acknowledged only</option>
              <option value="no">Unacknowledged only</option>
            </Select>
          </Field>
          <Field span={3} label="Sort by">
            <Select value={filters.sort || "timestamp_desc"} onChange={(e) => setPartial({ sort: e.target.value })}>
              <option value="timestamp_desc">Timestamp · new → old</option>
              <option value="timestamp_asc">Timestamp · old → new</option>
              <option value="severity_desc">Severity · High first</option>
              <option value="severity_asc">Severity · Low first</option>
              <option value="src_ip">Source IP</option>
              <option value="dst_ip">Destination IP</option>
            </Select>
          </Field>
          <Field span={3} label="Page size">
            <Select
              value={String(filters.page_size || 25)}
              onChange={(e) => setPartial({ page_size: Number(e.target.value) || 25 })}
            >
              {[10, 25, 50, 100, 250].map(n => <option key={n} value={n}>{n} per page</option>)}
            </Select>
          </Field>
          <Field span={3} label="Search">
            <TextInput value={filters.search || ""} onChange={(e) => setPartial({ search: e.target.value || undefined })} placeholder="Signature / category / IP text"/>
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ span, label, children }: { span: number; label: string; children: React.ReactNode }) {
  return (
    <div className="filter-field" style={{ gridColumn: `span ${span} / span ${span}` }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryTag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 9999,
      background: "#0f172a", border: `1px solid ${colors.border}`,
      color: colors.textSecondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium,
    }}>
      {children}
    </span>
  );
}

function MultiSelect({ options, value, onChange, name }: {
  name: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    const next = value.includes(v) ? value.filter(x => x !== v) : [...value, v];
    onChange(next);
  };
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: spacing["1.5"],
      padding: spacing["2"], borderRadius: radius.md, border: borders.base, background: colors.bgSurface,
      minHeight: 36,
    }}>
      {options.map(o => {
        const active = value.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)}
            style={{
              padding: "3px 8px", borderRadius: radius.sm,
              background: active ? "#1f2a4d" : "transparent",
              color: active ? colors.textPrimary : colors.textSecondary,
              border: `1px solid ${active ? colors.primary : colors.border}`,
              fontSize: typography.fontSize.xs, fontWeight: active ? typography.fontWeight.medium : typography.fontWeight.normal,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            {active ? <X size={11}/> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
