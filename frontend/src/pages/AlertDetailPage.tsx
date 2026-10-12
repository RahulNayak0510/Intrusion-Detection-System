import { useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckSquare, Square, Plus, AlertTriangle, FileJson, Shield, Hash, Tag, Gauge, Info } from "lucide-react";
import { addNote, acknowledgeEvent, fetchEvent } from "../lib/api";
import { Card, Stat } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, severityToTone } from "../components/ui/Badge";
import { Label, TextArea } from "../components/ui/Input";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/States";
import type { EventDetail as EventDetailT } from "../types";
import { borders, colors, radius, spacing, typography } from "../tokens";
import { format, formatDistanceToNow } from "date-fns";

export function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(Number(id)),
    enabled: !!id,
  });

  const ackMut = useMutation({
    mutationFn: (ack: boolean) => acknowledgeEvent(Number(id), ack),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event", id], }),
  });

  const noteMut = useMutation({
    mutationFn: (n: string) => addNote(Number(id), n),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["event", id] });
    },
  });

  if (q.isLoading) {
    return (
      <div>
        <BackLink/>
        <div style={{ marginTop: spacing["5"] }}>
          <LoadingSkeleton rows={8} cols={4}/>
        </div>
      </div>
    );
  }
  if (q.error) {
    return (
      <div>
        <BackLink/>
        <div style={{ marginTop: spacing["5"] }}>
          <ErrorState title="Failed to load event" message={String((q.error as any)?.message || q.error)} onRetry={() => q.refetch()}/>
        </div>
      </div>
    );
  }

  const ev = q.data as EventDetailT | undefined;
  if (!ev) {
    return (
      <div>
        <BackLink/>
        <div style={{ marginTop: spacing["5"] }}>
          <EmptyState title="Event not found" subtitle="The event may have been pruned by the retention job or never existed."/>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink/>

      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: spacing["4"],
        marginTop: spacing["4"], marginBottom: spacing["5"], alignItems: "flex-start",
      }}>
        <div style={{ display: "flex", gap: spacing["3"], alignItems: "flex-start" }}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.md,
            background: ev.severity === "HIGH" ? "#1e0f12" : ev.severity === "MEDIUM" ? "#231507" : ev.severity === "LOW" ? "#0a1838" : "#111827",
            border: `1px solid ${ev.severity === "HIGH" ? "#5b1f26" : ev.severity === "MEDIUM" ? "#6b3f11" : ev.severity === "LOW" ? "#143276" : "#334155"}`,
            color: colors.textPrimary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {ev.event_type === "alert" ? <AlertTriangle size={19}/> :
             ev.event_type === "flow" ? <Shield size={19}/> :
             ev.event_type === "dns" || ev.event_type === "http" || ev.event_type === "tls" ? <Tag size={19}/> :
             <Hash size={19}/>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: spacing["2"], alignItems: "center", marginBottom: spacing["2"], flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: typography.fontSize.xl, fontWeight: 700, color: colors.textPrimary }}>
                {ev.signature || `${ev.event_type.toUpperCase()} event #${ev.id}`}
              </h1>
              {ev.severity && <Badge tone={severityToTone(ev.severity)}>{ev.severity.toUpperCase()}</Badge>}
              <Badge tone="default">{ev.event_type.toUpperCase()}</Badge>
              {ev.acknowledged ? <Badge tone="success">Acknowledged</Badge> : <Badge tone="warning">Unacknowledged</Badge>}
              {ev.anomaly_score != null && (
                <Badge tone="info">
                  <Gauge size={12}/> Anomaly {(ev.anomaly_score * 100).toFixed(0)}% <span style={{ opacity: 0.7, marginLeft: 4 }}>· heuristic</span>
                </Badge>
              )}
            </div>
            <div style={{ fontSize: typography.fontSize.sm, color: colors.textSecondary }}>
              {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })} ·{" "}
              {format(new Date(ev.timestamp), "yyyy-MM-dd HH:mm:ss")} UTC
              {ev.signature_category && <> · {ev.signature_category}</>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: spacing["2"], flexWrap: "wrap" }}>
          <Button
            variant={ev.acknowledged ? "secondary" : "primary"}
            onClick={() => ackMut.mutate(!ev.acknowledged)}
            icon={ev.acknowledged ? <Square size={14}/> : <CheckSquare size={14}/>}
          >
            {ev.acknowledged ? "Unacknowledge" : "Acknowledge"}
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gap: spacing["5"], gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing["5"], minWidth: 0 }}>
          <Card title="Event details" icon={<Info size={15}/>}>
            <Grid2>
              <Row label="Event ID" mono>{ev.id}</Row>
              <Row label="Flow ID" mono>{ev.flow_id ?? "—"}</Row>
              <Row label="Type">{ev.event_type}</Row>
              <Row label="Protocol">{ev.protocol || "—"}</Row>
              <Row label="App protocol">{ev.app_proto || "—"}</Row>
              <Row label="Source" mono>
                {ev.src_ip || "—"}{ev.src_port ? `:${ev.src_port}` : ""}
              </Row>
              <Row label="Destination" mono>
                {ev.dst_ip || "—"}{ev.dst_port ? `:${ev.dst_port}` : ""}
              </Row>
              <Row label="Dedup key" mono small>
                <span style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>
                  {ev.dedup_key}
                </span>
              </Row>
            </Grid2>
          </Card>

          {ev.event_type === "dns" && <DNSPanel raw={ev.raw}/>}
          {ev.event_type === "http" && <HTTPPanel raw={ev.raw}/>}
          {ev.event_type === "tls" && <TLSPanel raw={ev.raw}/>}
          {ev.event_type === "flow" && <FlowPanel raw={ev.raw}/>}
          {ev.event_type === "alert" && <AlertPanel raw={ev.raw}/>}

          {ev.anomaly_score != null && (
            <Card
              title="Anomaly score (Isolation Forest · heuristic)"
              icon={<Gauge size={15}/>}
              subtitle="Secondary signal only. Never proof of an intrusion. Use alongside rule-based alerts."
            >
              <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: spacing["5"], alignItems: "center" }}>
                <div>
                  <Stat label="Heuristic score" tone={ev.anomaly_score > 0.7 ? "high" : ev.anomaly_score > 0.4 ? "medium" : "default"}
                    value={`${(ev.anomaly_score * 100).toFixed(0)}%`}
                    hint="Higher = more unusual"
                  />
                </div>
                <div>
                  <ScoreBar score={ev.anomaly_score}/>
                  {ev.anomaly_features && (
                    <FeatureContrib feat={ev.anomaly_features}/>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card title="Analyst notes" subtitle={`${ev.notes.length} note${ev.notes.length === 1 ? "" : "s"}`}>
            <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) noteMut.mutate(note.trim()); }}
              style={{ display: "flex", flexDirection: "column", gap: spacing["2"], marginBottom: spacing["4"] }}>
              <Label>Add a note</Label>
              <TextArea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Investigation context, IOCs, correlation notes, next steps…" rows={4}/>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" icon={<Plus size={14}/>} disabled={!note.trim() || noteMut.isPending}>
                  {noteMut.isPending ? "Adding…" : "Add note"}
                </Button>
              </div>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: spacing["3"] }}>
              {ev.notes.length === 0 && (
                <div style={{ padding: spacing["4"], color: colors.textMuted, fontSize: typography.fontSize.sm,
                  border: `1px dashed ${colors.border}`, borderRadius: radius.md, textAlign: "center" }}>
                  No analyst notes yet.
                </div>
              )}
              {ev.notes.map((n) => (
                <div key={n.id} style={{
                  padding: spacing["4"], border: borders.base, borderRadius: radius.md, background: colors.bgSurfaceElevated,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing["2"], gap: spacing["3"], flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: spacing["2"] }}>
                      <span style={{ fontWeight: typography.fontWeight.semibold, color: colors.textPrimary }}>
                        {n.author_username || `user #${n.author_id}`}
                      </span>
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, fontVariantNumeric: "tabular-nums" }}>
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })} · {format(new Date(n.created_at), "yyyy-MM-dd HH:mm:ss")} UTC
                      </span>
                    </div>
                  </div>
                  <div style={{ color: colors.textPrimary, fontSize: typography.fontSize.sm, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {n.note}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: spacing["5"], minWidth: 0 }}>
          <Card title="Enrichment" subtitle="Allowlists + asset labels from configuration">
            <Grid2>
              <Row label="Allowlisted">
                {ev.allowlisted ? <Badge tone="warning">Yes · flagged only</Badge> : <span style={{ color: colors.textSecondary }}>No</span>}
              </Row>
              <Row label="Asset labels">
                {ev.asset_labels.length === 0 ? <span style={{ color: colors.textMuted }}>none</span> :
                  <div style={{ display: "flex", flexWrap: "wrap", gap: spacing["1.5"] }}>
                    {ev.asset_labels.map(l => <Badge key={l} tone="info">{l}</Badge>)}
                  </div>}
              </Row>
            </Grid2>
          </Card>

          <Card title="Raw event (JSON)" icon={<FileJson size={15}/>} subtitle="Source EVE fields (no payloads stored)">
            <pre style={{
              margin: 0, padding: spacing["3"], background: colors.bgRoot, border: borders.base,
              borderRadius: radius.md, maxHeight: 540, overflow: "auto",
              fontFamily: typography.fontFamilyMono, fontSize: typography.fontSize.xs, lineHeight: 1.55,
              color: colors.textSecondary, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
{safeStringify(ev.raw)}
            </pre>
          </Card>
        </div>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          #root main > div > div[style*="gridTemplateColumns: \"minmax(0, 2fr) minmax(0, 1fr)\""] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function BackLink() {
  return (
    <RouterLink to="/alerts" style={{
      display: "inline-flex", alignItems: "center", gap: spacing["1.5"],
      color: colors.textSecondary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium,
      textDecoration: "none",
    }}>
      <ArrowLeft size={14}/>
      <span>Back to alerts</span>
    </RouterLink>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 1fr) 2fr", gap: `${spacing["2"]} ${spacing["4"]}`, rowGap: spacing["2"] }}>
      {children}
    </div>
  );
}

function Row({ label, children, mono, small }: { label: string; children: React.ReactNode; mono?: boolean; small?: boolean }) {
  return (
    <>
      <div style={{ color: colors.textMuted, fontSize: small ? typography.fontSize.xs : typography.fontSize.sm, fontWeight: typography.fontWeight.medium, letterSpacing: 0.02, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{
        color: colors.textPrimary, fontSize: small ? typography.fontSize.xs : typography.fontSize.sm,
        fontFamily: mono ? typography.fontFamilyMono : undefined,
        overflow: "hidden", minWidth: 0,
      }}>
        {children}
      </div>
    </>
  );
}

function safeStringify(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function get<T = any>(o: any, p: string, fallback?: T): T | undefined {
  const parts = p.split(".");
  let cur = o;
  for (const part of parts) {
    if (cur == null) return fallback;
    cur = cur[part];
  }
  return (cur === undefined ? fallback : cur) as T;
}

function DNSPanel({ raw }: { raw: any }) {
  const dns = get<any>(raw, "dns") || {};
  return (
    <Card title="DNS event" subtitle="Suricata DNS fields">
      <Grid2>
        <Row label="Type">{dns.type || "—"}</Row>
        <Row label="RCODE">{dns.rcode ?? "—"}</Row>
        <Row label="RR name" mono>{dns.rrname || "—"}</Row>
        <Row label="RR type">{dns.rrtype || "—"}</Row>
        <Row label="TTL">{dns.ttl ?? "—"}</Row>
        <Row label="Rdata" mono small>
          {Array.isArray(dns.answers) ? dns.answers.map((a: any) => a.rdata).filter(Boolean).join(", ") : (dns.rdata || "—")}
        </Row>
      </Grid2>
    </Card>
  );
}

function HTTPPanel({ raw }: { raw: any }) {
  const h = get<any>(raw, "http") || {};
  return (
    <Card title="HTTP event" subtitle="Request / response metadata (no payload)">
      <Grid2>
        <Row label="Method">{h.http_method || "—"}</Row>
        <Row label="Host" mono>{h.hostname || "—"}</Row>
        <Row label="URL" mono small>{h.url || "—"}</Row>
        <Row label="Status">{h.status ?? "—"}</Row>
        <Row label="Protocol">{h.protocol || "—"}</Row>
        <Row label="User-Agent" mono small>{h.http_user_agent || "—"}</Row>
        <Row label="Length">{h.length ?? "—"} bytes</Row>
        <Row label="Content type">{h.http_content_type || "—"}</Row>
      </Grid2>
    </Card>
  );
}

function TLSPanel({ raw }: { raw: any }) {
  const t = get<any>(raw, "tls") || {};
  return (
    <Card title="TLS event" subtitle="Handshake metadata / JA3 (no secrets captured)">
      <Grid2>
        <Row label="Version">{t.version || "—"}</Row>
        <Row label="SNI" mono>{t.sni || "—"}</Row>
        <Row label="Subject" mono small>{t.subject || "—"}</Row>
        <Row label="Issuer" mono small>{t.issuerdn || "—"}</Row>
        <Row label="Not before">{t.notbefore || "—"}</Row>
        <Row label="Not after">{t.notafter || "—"}</Row>
        {t.ja3 && <Row label="JA3 hash" mono small>{t.ja3?.hash || "—"}</Row>}
      </Grid2>
    </Card>
  );
}

function FlowPanel({ raw }: { raw: any }) {
  const f = get<any>(raw, "flow") || {};
  return (
    <Card title="Flow event" subtitle="Suricata flow counters">
      <Grid2>
        <Row label="Age">{f.age ?? "—"} s</Row>
        <Row label="State">{f.state || "—"} / {f.reason || "—"}</Row>
        <Row label="Bytes → server">{(f.bytes_toserver ?? 0).toLocaleString()}</Row>
        <Row label="Bytes → client">{(f.bytes_toclient ?? 0).toLocaleString()}</Row>
        <Row label="Packets → server">{(f.pkts_toserver ?? 0).toLocaleString()}</Row>
        <Row label="Packets → client">{(f.pkts_toclient ?? 0).toLocaleString()}</Row>
        <Row label="Start">{f.start || "—"}</Row>
        <Row label="End">{f.end || "—"}</Row>
      </Grid2>
    </Card>
  );
}

function AlertPanel({ raw }: { raw: any }) {
  const a = get<any>(raw, "alert") || {};
  return (
    <Card title="Alert signature" subtitle="Suricata rule metadata">
      <Grid2>
        <Row label="Signature">{a.signature || "—"}</Row>
        <Row label="Category">{a.category || "—"}</Row>
        <Row label="Severity (raw)">{(a.severity ?? "—").toString()}</Row>
        <Row label="Signature ID">{a.signature_id ?? "—"}</Row>
        <Row label="GID">{a.gid ?? "—"}</Row>
        <Row label="Rev">{a.rev ?? "—"}</Row>
        <Row label="Action">{a.action || "—"}</Row>
      </Grid2>
    </Card>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const color = pct > 70 ? colors.severityHigh : pct > 40 ? colors.severityMedium : colors.severityLow;
  return (
    <div>
      <div style={{
        width: "100%", height: 10, background: colors.bgRoot,
        border: borders.base, borderRadius: 9999, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, rgba(79,70,229,0.6), ${color})`,
          transition: "width 400ms ease",
        }}/>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: typography.fontSize.xs, color: colors.textMuted }}>
        <span>benign (training mean)</span>
        <span>more anomalous →</span>
      </div>
    </div>
  );
}

function FeatureContrib({ feat }: { feat: any }) {
  const label = feat?._label || "Heuristic feature contributions";
  const top: any[] = Array.isArray(feat?.top) ? feat.top : [];
  return (
    <div style={{ marginTop: spacing["4"] }}>
      <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing["2"], fontWeight: typography.fontWeight.medium }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: spacing["2"] }}>
        {top.length === 0 && <div style={{ color: colors.textMuted, fontSize: typography.fontSize.xs }}>No contribution detail available.</div>}
        {top.map((f, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) 60px", gap: spacing["2"], alignItems: "center",
            padding: spacing["2"] + " " + spacing["3"],
            border: borders.base, borderRadius: radius.md, background: colors.bgRoot, fontSize: typography.fontSize.xs,
          }}>
            <span style={{ fontFamily: typography.fontFamilyMono, color: colors.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.feature}</span>
            <div style={{ height: 5, background: "#172038", borderRadius: 9999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, Math.abs(f.z_score) * 12))}%`, background: colors.primary }}/>
            </div>
            <span style={{ color: colors.textPrimary, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              z={Number(f.z_score).toFixed(1)}σ
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
