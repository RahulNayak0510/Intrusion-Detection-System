import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, CheckSquare, Square, Eye } from "lucide-react";
import { borders, colors, radius, spacing, typography, severityBgColor, severityTextColor } from "../tokens";
import type { EventSummary } from "../types";
import { Button } from "./ui/Button";
import { Badge, severityToTone } from "./ui/Badge";
import { formatDistanceToNow, formatISO } from "date-fns";

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  render: (row: T) => React.ReactNode;
}

export function AlertTable({
  rows,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onAcknowledge,
  empty,
}: {
  rows: EventSummary[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onAcknowledge?: (id: number, ack: boolean) => void;
  empty: React.ReactNode;
}) {
  const columns: ColumnDef<EventSummary>[] = [
    {
      key: "severity",
      header: "Severity",
      width: "110px",
      render: (r) => (
        <Badge tone={severityToTone(r.severity)}>
          <span style={{ letterSpacing: 0.04 }}>{(r.severity || "UNKNOWN").toUpperCase()}</span>
        </Badge>
      ),
    },
    {
      key: "timestamp",
      header: "Timestamp",
      width: "200px",
      render: (r) => (
        <div>
          <div style={{ fontVariantNumeric: "tabular-nums", fontSize: typography.fontSize.sm, color: colors.textPrimary }}>
            {formatDistanceToNow(new Date(r.timestamp), { addSuffix: true })}
          </div>
          <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {formatISO(new Date(r.timestamp), { representation: "complete" }).replace("T", " ").slice(0, 19)} UTC
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "90px",
      render: (r) => (
        <span style={{
          padding: "2px 8px", borderRadius: radius.sm,
          background: "#0f172a", border: `1px solid ${colors.border}`,
          color: colors.textSecondary, fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium,
          textTransform: "capitalize",
        }}>
          {r.event_type}
        </span>
      ),
    },
    {
      key: "sig",
      header: "Signature / Category",
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.signature || <span style={{ color: colors.textMuted }}>(no signature)</span>}
          </div>
          {r.signature_category && (
            <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.signature_category}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "src",
      header: "Source",
      width: "170px",
      render: (r) => <EndpointCell ip={r.src_ip} port={r.src_port} proto={r.protocol} />,
    },
    {
      key: "dst",
      header: "Destination",
      width: "170px",
      render: (r) => <EndpointCell ip={r.dst_ip} port={r.dst_port} proto={r.app_proto} />,
    },
    {
      key: "ack",
      header: "Ack",
      width: "80px",
      render: (r) => (
        <button
          title={r.acknowledged ? "Acknowledged — click to undo" : "Acknowledge"}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAcknowledge?.(r.id, !r.acknowledged); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: spacing["1.5"],
            padding: "2px 8px", borderRadius: radius.sm,
            background: r.acknowledged ? "#052e1c" : "transparent",
            border: `1px solid ${r.acknowledged ? "#064e3b" : colors.border}`,
            color: r.acknowledged ? "#34d399" : colors.textMuted,
            cursor: "pointer", fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium,
          }}
        >
          {r.acknowledged ? <CheckSquare size={13}/> : <Square size={13}/>}
          {r.acknowledged ? "Yes" : "No"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      render: (r) => (
        <RouterLink to={`/alerts/${r.id}`} style={{ display: "inline-flex" }}>
          <Button variant="subtle" size="sm" icon={<Eye size={13}/>}>View</Button>
        </RouterLink>
      ),
    },
  ];

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (!loading && rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div>
      <div style={{
        background: colors.bgSurface, border: borders.base, borderRadius: radius.lg,
        overflow: "auto", maxWidth: "100%",
      }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1000 }}>
          <thead>
            <tr style={{ background: colors.bgSurfaceElevated }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    padding: `${spacing["3"]} ${spacing["4"]}`,
                    borderBottom: borders.base,
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.textSecondary,
                    letterSpacing: 0.03,
                    textTransform: "uppercase",
                    textAlign: "left",
                    width: c.width || "auto",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr
                key={r.id || i}
                style={{
                  transition: "background 100ms ease",
                  cursor: "default",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSurfaceHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: `${spacing["3"]} ${spacing["4"]}`,
                      borderBottom: i < (rows?.length || 0) - 1 ? borders.base : "none",
                      fontSize: typography.fontSize.sm,
                      color: colors.textPrimary,
                      verticalAlign: "middle",
                      width: c.width || "auto",
                    }}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
            {loading && Array.from({ length: Math.min(8, pageSize) }).map((_, i) => (
              <tr key={"sk" + i}>
                {columns.map((c, j) => (
                  <td key={c.key + j} style={{
                    padding: `${spacing["3"]} ${spacing["4"]}`, borderBottom: i < 7 ? borders.base : "none",
                  }}>
                    <div style={{
                      height: 14, width: `${50 + ((i + j) * 11) % 40}%`, borderRadius: 3,
                      background: "linear-gradient(90deg, #172038 0%, #1d2846 40%, #172038 80%)",
                      backgroundSize: "200% 100%",
                      animation: "nids-skeleton 1.2s ease-in-out infinite",
                    }}/>
                    <style>{`@keyframes nids-skeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${spacing["4"]} ${spacing["1"]} 0`,
        color: colors.textSecondary, fontSize: typography.fontSize.sm,
      }}>
        <div style={{ fontVariantNumeric: "tabular-nums" }}>
          Showing{" "}
          <strong style={{ color: colors.textPrimary }}>
            {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
          </strong>{" "}
          of <strong style={{ color: colors.textPrimary }}>{total}</strong> events
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing["2"] }}>
          <Button
            variant="subtle"
            size="sm"
            icon={<ChevronLeft size={14}/>}
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Prev
          </Button>
          <span style={{
            padding: `0 ${spacing["2.5"]}`, height: 28, display: "inline-flex", alignItems: "center",
            fontSize: typography.fontSize.sm, color: colors.textSecondary, fontVariantNumeric: "tabular-nums",
          }}>
            Page {page} / {pageCount}
          </span>
          <Button
            variant="subtle"
            size="sm"
            iconRight={<ChevronRight size={14}/>}
            disabled={page >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function EndpointCell({ ip, port, proto }: { ip?: string | null; port?: number | null; proto?: string | null }) {
  return (
    <div style={{ fontFamily: typography.fontFamilyMono, fontSize: typography.fontSize.sm, lineHeight: 1.3, minWidth: 0 }}>
      <div style={{ color: colors.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ip || "—"}
      </div>
      <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {port !== null && port !== undefined ? `:${port}` : "—"}
        {proto ? <span style={{ marginLeft: 6, color: colors.textMuted }}>({proto})</span> : null}
      </div>
    </div>
  );
}
