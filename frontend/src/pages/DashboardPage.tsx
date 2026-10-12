import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertTriangle, Clock, Gauge, ListChecks, Network, Play, RefreshCw, ShieldCheck,
} from "lucide-react";
import { fetchDashboard, replaySample } from "../lib/api";
import { Card, Grid, Stat } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, severityToTone } from "../components/ui/Badge";
import { Select } from "../components/ui/Input";
import { EmptyState, ErrorState, LoadingSkeleton, NoEventsEmpty } from "../components/States";
import type { DashboardSummary, EventSummary } from "../types";
import { borders, colors, radius, spacing, typography } from "../tokens";
import { formatDistanceToNow } from "date-fns";
import { formatUtcShort, parseApiUtcDate } from "../lib/dateTime";

export function DashboardPage() {
  const [hours, setHours] = useState<number>(24);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard", hours], queryFn: () => fetchDashboard(hours), placeholderData: keepPreviousData });
  const replayMut = useMutation({
    mutationFn: () => replaySample(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["events"] }),
      ]);
    },
  });

  const data: DashboardSummary | undefined = q.data;
  const anyData = !!data && (
    data.alert_counts_over_time.some(p => p.count > 0) ||
    data.recent_events.length > 0
  );

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: spacing["5"], flexWrap: "wrap", gap: spacing["3"],
      }}>
        <div>
          <div style={{ display: "flex", gap: spacing["3"], alignItems: "center" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, background: "#0b1a33", border: "1px solid #163060",
              color: "#93c5fd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Activity size={18}/>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: typography.fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, letterSpacing: -0.01 }}>
                Dashboard
              </h1>
              <p style={{ margin: `${spacing["1"]} 0 0`, color: colors.textSecondary, fontSize: typography.fontSize.sm, maxWidth: 620 }}>
                Analyst overview of alert volume, severity distribution, and top talkers. All counts come from ingested Suricata events.
                ML anomaly scores (if enabled) are separate and never replace rule-based alerts.
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: spacing["2"], alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 180 }}>
            <Select value={String(hours)} onChange={(e) => setHours(Number(e.target.value))}>
              <option value="1">Last 1 hour</option>
              <option value="6">Last 6 hours</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
            </Select>
          </div>
          <RouterLink to="/alerts">
            <Button variant="subtle" icon={<AlertTriangle size={14}/>}>Open alerts</Button>
          </RouterLink>
          <Button variant="secondary" onClick={() => replayMut.mutate()} disabled={replayMut.isPending} icon={<Play size={14}/>}>
            {replayMut.isPending ? "Replaying…" : "Replay sample"}
          </Button>
          <Button variant="subtle" onClick={() => q.refetch()} icon={<RefreshCw size={14}/>}>Refresh</Button>
        </div>
      </div>

      {q.error && !q.data ? (
        <ErrorState title="Failed to load dashboard" message={String((q.error as any)?.message || q.error)} onRetry={() => q.refetch()}/>
      ) : q.isLoading && !q.data ? (
        <Grid cols={{ default: 1, md: 2, lg: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 112, borderRadius: radius.lg,
              background: "linear-gradient(90deg, #141c33 0%, #1a2546 40%, #141c33 80%)",
              backgroundSize: "200% 100%",
              animation: "nids-skeleton 1.4s ease-in-out infinite",
              border: borders.base,
            }}/>
          ))}
          <style>{`@keyframes nids-skeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
        </Grid>
      ) : !anyData ? (
        <NoEventsEmpty onReplay={() => replayMut.mutate()}/>
      ) : (
        <>
          {data && <MetricsStrip data={data}/>}

          <div className="dashboard-primary-grid">
            <Card title="Alert counts over time" icon={<Clock size={15}/>} subtitle={`Bucketed counts for the last ${hours}h`}>
              <AlertCountsChart data={data.alert_counts_over_time}/>
            </Card>

            <Card title="Severity distribution" icon={<AlertTriangle size={15}/>} subtitle="Alerts in window by severity">
              <SeverityBars data={data.severity_counts}/>
              <div style={{ marginTop: spacing["4"] }}>
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium, marginBottom: spacing["2"] }}>Event type mix</div>
                <div style={{ display: "flex", flexDirection: "column", gap: spacing["1.5"] }}>
                  {(data.event_type_counts || []).slice(0, 6).map((e, i) => (
                    <div key={e.event_type + i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 44px", alignItems: "center", gap: spacing["2"] }}>
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, textTransform: "capitalize" }}>{e.event_type}</span>
                      <div style={{ height: 6, background: colors.bgRoot, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${pct(e.count, maxC(data.event_type_counts))}%`,
                          background: i === 0 ? colors.primary : i === 1 ? colors.severityMedium : "#64748b",
                        }}/>
                      </div>
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="dashboard-secondary-grid">
            <Card title="Top source IPs (by alert count)" icon={<Network size={15}/>} subtitle="Likely sources of suspicious activity in the selected window">
              <TopIPBars rows={data.top_source_ips} palette="#f59e0b"/>
            </Card>
            <Card title="Top destination IPs (by alert count)" icon={<Network size={15}/>} subtitle="Likely targets in the selected window">
              <TopIPBars rows={data.top_destination_ips} palette="#2563eb"/>
            </Card>
          </div>

          <div style={{ marginTop: spacing["5"] }}>
            <Card
              title="Recent events"
              icon={<ListChecks size={15}/>}
              subtitle={`${data.recent_events.length || 0} most recent events across all types`}
              action={<RouterLink to="/alerts"><Button size="sm" variant="subtle">View all</Button></RouterLink>}
            >
              <RecentEventsList rows={data.recent_events}/>
            </Card>
          </div>

        </>
      )}
    </div>
  );
}

function pct(n: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(2, Math.min(100, (n / max) * 100));
}
function maxC(arr: { count: number }[] = []) {
  let m = 0;
  for (const a of arr) if (a.count > m) m = a.count;
  return m;
}

function MetricsStrip({ data }: { data: DashboardSummary }) {
  const last = data.last_24h;
  const ackRatio = last.total_alerts > 0 ? (last.acknowledged / last.total_alerts) * 100 : 0;
  return (
    <Grid cols={{ default: 1, md: 2, lg: 4 }}>
      <Stat label="Total alerts (24h)" value={last.total_alerts.toLocaleString()} tone="default"
        hint={`${last.high} high · ${last.medium} medium · ${last.low} low`} icon={<AlertTriangle size={16}/>}/>
      <Stat label="High severity (24h)" value={last.high.toLocaleString()} tone="high"
        hint="Rule-based severity only" icon={<ShieldCheck size={16}/>}/>
      <Stat label="Acknowledged" value={`${ackRatio.toFixed(0)}%`}
        tone={ackRatio >= 80 ? "success" : ackRatio >= 40 ? "medium" : "default"}
        hint={`${last.acknowledged} of ${last.total_alerts} alerts triaged`} icon={<ListChecks size={16}/>}/>
      <Stat label="Flows scored (ML)" value={last.flows_scored.toLocaleString()} tone={last.flows_scored > 0 ? "low" : "default"}
        hint={last.flows_scored === 0 ? "Disabled or no flow data yet" : "Isolation Forest anomaly · heuristic only"}
        icon={<Gauge size={16}/>}/>
    </Grid>
  );
}

const CHART_HEIGHT = 280;

function AlertCountsChart({ data }: { data: DashboardSummary["alert_counts_over_time"] }) {
  const rows = (data || []).map(p => ({
    ...p,
    bucketLabel: formatUtcShort(p.bucket),
    total: p.count,
  }));
  if (rows.length === 0) {
    return <EmptyState title="No alert activity in this window" subtitle="No rule-based alerts were ingested in the selected range." icon={<Clock size={18}/>}/>;
  }
  return (
    <div style={{ width: "100%", height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false}/>
          <XAxis
            dataKey="bucketLabel"
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            axisLine={{ stroke: colors.border }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            stroke={colors.textMuted}
            tick={{ fontSize: 11, fill: colors.textMuted }}
            axisLine={{ stroke: colors.border }}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: colors.bgSurfaceElevated,
              border: borders.strong,
              borderRadius: radius.md,
              color: colors.textPrimary,
              fontSize: 12,
              boxShadow: colors.shadowElevated,
            }}
            labelStyle={{ color: colors.textSecondary, fontWeight: 600, marginBottom: 4 }}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Legend
            wrapperStyle={{ color: colors.textSecondary, fontSize: 12, paddingTop: 10 }}
            iconType="square"
          />
          <Bar dataKey="total" stackId="a" name="Total" fill="#4f46e5" radius={[2, 2, 0, 0]}>
            {rows.map((_, i) => (
              <Cell key={i} fillOpacity={0.9}/>
            ))}
          </Bar>
          <Bar dataKey="severity_high" stackId="s" name="High" fill={colors.severityHigh} radius={[2, 2, 0, 0]}/>
          <Bar dataKey="severity_medium" stackId="s" name="Medium" fill={colors.severityMedium}/>
          <Bar dataKey="severity_low" stackId="s" name="Low" fill={colors.severityLow} radius={[2, 2, 0, 0]}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeverityBars({ data }: { data: DashboardSummary["severity_counts"] }) {
  const rows: Array<{ sev: string; count: number; tone: ReturnType<typeof severityToTone> }> = [];
  const order = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"];
  const map: Record<string, number> = {};
  for (const s of data || []) map[(s.severity || "UNKNOWN").toUpperCase()] = s.count;
  for (const sev of order) {
    rows.push({ sev, count: map[sev] || 0, tone: severityToTone(sev === "UNKNOWN" ? "" : sev) });
  }
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing["3"] }}>
      {rows.map(r => {
        const pct = (r.count / max) * 100;
        const bg = r.sev === "HIGH" ? colors.severityHigh : r.sev === "MEDIUM" ? colors.severityMedium : r.sev === "LOW" ? colors.severityLow : colors.severityUnknown;
        return (
          <div key={r.sev}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing["1.5"] }}>
              <Badge tone={r.tone}>{r.sev.toUpperCase()}</Badge>
              <span style={{ fontSize: typography.fontSize.xs, color: colors.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                {r.count.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 8, background: colors.bgRoot, borderRadius: 999, overflow: "hidden", border: borders.base }}>
              <div style={{ height: "100%", width: `${pct}%`, background: bg, transition: "width 400ms" }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopIPBars({ rows, palette }: { rows: DashboardSummary["top_source_ips"]; palette: string }) {
  if (!rows || rows.length === 0) {
    return <EmptyState title="No IPs" subtitle="No alerts were ingested for this view in the selected range." icon={<Network size={18}/>}/>;
  }
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing["2.5"] }}>
      {rows.map((r, i) => {
        const pct = (r.count / max) * 100;
        return (
          <div key={r.ip + i} style={{
            padding: `${spacing["2.5"]} ${spacing["3"]}`, background: colors.bgRoot,
            border: borders.base, borderRadius: radius.md,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing["1.5"] }}>
              <span style={{
                fontFamily: typography.fontFamilyMono, fontSize: typography.fontSize.sm, color: colors.textPrimary,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{r.ip}</span>
              <span style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                {r.count.toLocaleString()} alert{r.count === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ height: 6, background: "#0d152b", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: `linear-gradient(90deg, ${palette}aa, ${palette})`,
                transition: "width 400ms ease",
              }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentEventsList({ rows }: { rows: EventSummary[] }) {
  const nav = useNavigate();
  if (!rows || rows.length === 0) {
    return <EmptyState title="No recent events" subtitle="Replay the bundled sample events to see example rows here."/>;
  }
  return (
    <div style={{ border: borders.base, borderRadius: radius.md, overflow: "hidden" }}>
      <table style={{ width: "100%" }}>
        <thead>
          <tr style={{ background: colors.bgSurfaceElevated }}>
            {["Severity", "When", "Type", "Signature / Category", "Source → Destination"].map((h, i) => (
              <th key={i} style={{
                padding: `${spacing["2.5"]} ${spacing["3"]}`,
                fontSize: typography.fontSize.xs, fontWeight: 600, color: colors.textSecondary,
                letterSpacing: 0.03, textTransform: "uppercase", textAlign: "left",
                borderBottom: borders.base,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.id}
              onClick={() => nav(`/alerts/${r.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nav(`/alerts/${r.id}`); } }}
              tabIndex={0}
              style={{
                transition: "background 100ms ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSurfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
                <td style={{ padding: `${spacing["2.5"]} ${spacing["3"]}`, borderBottom: idx < rows.length - 1 ? borders.base : "none" }}>
                  <Badge tone={severityToTone(r.severity)}>{(r.severity || "—").toUpperCase()}</Badge>
                </td>
                <td style={{ padding: `${spacing["2.5"]} ${spacing["3"]}`, borderBottom: idx < rows.length - 1 ? borders.base : "none", fontSize: typography.fontSize.sm, color: colors.textPrimary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {formatDistanceToNow(parseApiUtcDate(r.timestamp), { addSuffix: true })}
                </td>
                <td style={{ padding: `${spacing["2.5"]} ${spacing["3"]}`, borderBottom: idx < rows.length - 1 ? borders.base : "none" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: radius.sm, background: "#0f172a",
                    border: `1px solid ${colors.border}`, color: colors.textSecondary, fontSize: typography.fontSize.xs,
                    textTransform: "capitalize", fontWeight: 500,
                  }}>{r.event_type}</span>
                </td>
                <td style={{ padding: `${spacing["2.5"]} ${spacing["3"]}`, borderBottom: idx < rows.length - 1 ? borders.base : "none", fontSize: typography.fontSize.sm, color: colors.textPrimary, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.signature || <span style={{ color: colors.textMuted }}>—</span>}
                  </div>
                  {r.signature_category && (
                    <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.signature_category}
                    </div>
                  )}
                </td>
                <td style={{
                  padding: `${spacing["2.5"]} ${spacing["3"]}`, borderBottom: idx < rows.length - 1 ? borders.base : "none",
                  fontFamily: typography.fontFamilyMono, fontSize: typography.fontSize.sm, color: colors.textSecondary, whiteSpace: "nowrap",
                }}>
                  <span style={{ color: colors.textPrimary }}>{r.src_ip || "—"}</span>
                  {r.src_port ? <span>:{r.src_port}</span> : null}
                  <span style={{ margin: "0 6px", color: colors.textMuted }}>→</span>
                  <span style={{ color: colors.textPrimary }}>{r.dst_ip || "—"}</span>
                  {r.dst_port ? <span>:{r.dst_port}</span> : null}
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
