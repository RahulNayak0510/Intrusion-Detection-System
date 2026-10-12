import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { AlertTable } from "../components/AlertTable";
import { FilterPanel } from "../components/FilterPanel";
import { EmptyState, ErrorState, LoadingSkeleton, NoEventsEmpty, NoFilteredEvents } from "../components/States";
import { acknowledgeEvent, fetchEvents, replaySample } from "../lib/api";
import { Button } from "../components/ui/Button";
import type { EventFilters } from "../types";
import { colors, spacing, typography } from "../tokens";

export function AlertsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<EventFilters>(() => ({
    ...initialTimeFilter("24h"),
    sort: "timestamp_desc",
    page: 1,
    page_size: 25,
  }));

  const page = filters.page || 1;
  const pageSize = filters.page_size || 25;

  const q = useQuery({
    queryKey: ["events", filters],
    queryFn: () => fetchEvents(filters),
    placeholderData: keepPreviousData,
  });

  const ackMut = useMutation({
    mutationFn: ({ id, ack }: { id: number; ack: boolean }) => acknowledgeEvent(id, ack),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] }),
  });

  const replayMut = useMutation({
    mutationFn: () => replaySample(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["events"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });

  const hasAnyFilter = useMemo(() => {
    const f = filters;
    return !!(
      (f.severity && f.severity.length) ||
      (f.event_type && f.event_type.length) ||
      f.src_ip || f.dst_ip || f.proto || f.search ||
      f.acknowledged === true || f.acknowledged === false
    );
  }, [filters]);

  const total = q.data?.total ?? 0;
  const items = q.data?.items ?? [];

  return (
    <div>
      <PageHeader
        onRefresh={() => q.refetch()}
        refreshing={q.isFetching}
        onReplay={() => replayMut.mutate()}
        replaying={replayMut.isPending}
      />

      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onReplay={() => replayMut.mutate()}
      />

      {q.error ? (
        <ErrorState title="Failed to load events" message={String((q.error as any)?.message || q.error)} onRetry={() => q.refetch()}/>
      ) : q.isLoading && !q.data ? (
        <LoadingSkeleton rows={Math.min(10, pageSize)} cols={7}/>
      ) : total === 0 && !hasAnyFilter ? (
        <NoEventsEmpty onReplay={() => replayMut.mutate()}/>
      ) : total === 0 && hasAnyFilter ? (
        <NoFilteredEvents/>
      ) : (
        <AlertTable
          rows={items}
          loading={q.isFetching}
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => setFilters({ ...filters, page: p })}
          onAcknowledge={(id, ack) => ackMut.mutate({ id, ack })}
          empty={<NoFilteredEvents/>}
        />
      )}
    </div>
  );
}

function PageHeader({ onRefresh, refreshing, onReplay, replaying }: {
  onRefresh: () => void; refreshing: boolean; onReplay: () => void; replaying: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: spacing["5"], flexWrap: "wrap", gap: spacing["3"],
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: spacing["3"] }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "#1e1224", border: "1px solid #3b1f2b",
          color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <AlertTriangle size={18}/>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: typography.fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, letterSpacing: -0.01 }}>
            Alerts & Events
          </h1>
          <p style={{ margin: `${spacing["1"]} 0 0`, fontSize: typography.fontSize.sm, color: colors.textSecondary, maxWidth: 640 }}>
            Primary investigation workspace. Filter, sort, paginate, acknowledge, and open an event to add analyst notes.
            Bright severity colors distinguish rule-based Suricata alerts; anomaly scores, when enabled, appear on the detail page.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: spacing["2"] }}>
        <RouterLink to="/dashboard">
          <Button variant="subtle" icon={<Activity size={14}/>}>Dashboard</Button>
        </RouterLink>
        <Button variant="secondary" onClick={onReplay} disabled={replaying}>
          {replaying ? "Replaying…" : "Replay sample"}
        </Button>
        <Button variant="subtle" onClick={onRefresh} icon={<RefreshCw size={14} style={{ transition: "transform 200ms", transform: refreshing ? "rotate(180deg)" : "rotate(0)" }}/>}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

function initialTimeFilter(preset: "15m" | "1h" | "24h" | "7d" | "all"): EventFilters {
  switch (preset) {
    case "15m": return { since: new Date(Date.now() - 15 * 60_000).toISOString() };
    case "1h": return { since: new Date(Date.now() - 60 * 60_000).toISOString() };
    case "24h": return { since: new Date(Date.now() - 24 * 60 * 60_000).toISOString() };
    case "7d": return { since: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString() };
    default: return {};
  }
}
