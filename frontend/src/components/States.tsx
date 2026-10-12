import { AlertTriangle, Database, SearchX, WifiOff } from "lucide-react";
import { borders, colors, radius, spacing, typography } from "../tokens";
import { Button } from "./ui/Button";

export function LoadingSkeleton({ rows = 10, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div style={{
      background: colors.bgSurface, border: borders.base, borderRadius: radius.lg,
      overflow: "hidden",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: spacing["2"], padding: spacing["4"], borderBottom: borders.base,
        background: colors.bgSurfaceElevated,
      }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBar key={i} width="70%" height={12} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: spacing["2"] }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            style={{
              display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: spacing["2"], padding: spacing["3"], borderBottom: r < rows - 1 ? borders.base : "none",
            }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonBar key={c} width={60 + ((r + c) % 30)} height={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBar({ width = "80%", height = 10 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        width: typeof width === "number" ? `${width}%` : width,
        maxWidth: "100%",
        height,
        background: "linear-gradient(90deg, #172038 0%, #1d2846 40%, #172038 80%)",
        backgroundSize: "200% 100%",
        borderRadius: radius.sm,
        animation: "nids-skeleton 1.2s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes nids-skeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}

export function EmptyState({
  title, subtitle, icon, action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void; } | null;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: spacing["12"],
      background: colors.bgSurface, border: borders.base, borderRadius: radius.lg,
      color: colors.textSecondary, textAlign: "center",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: radius.lg,
        background: colors.bgSurfaceElevated, border: borders.base,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: colors.textMuted, marginBottom: spacing["4"],
      }}>
        {icon || <SearchX size={20}/>}
      </div>
      <div style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: typography.fontSize.sm, marginTop: spacing["2"], maxWidth: 480 }}>
          {subtitle}
        </div>
      )}
      {action && (
        <div style={{ marginTop: spacing["5"] }}>
          <Button onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title, message, onRetry,
}: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: spacing["12"],
      background: "#1a1020", border: `1px solid #3b1f2b`, borderRadius: radius.lg,
      color: colors.textSecondary, textAlign: "center",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: radius.lg,
        background: "#2a1420", border: `1px solid #5b2a3c`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fecaca", marginBottom: spacing["4"],
      }}>
        <WifiOff size={20}/>
      </div>
      <div style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary }}>
        {title || "Could not load data"}
      </div>
      {message && (
        <div style={{ fontSize: typography.fontSize.sm, marginTop: spacing["2"], maxWidth: 520 }}>
          {message}
        </div>
      )}
      {onRetry && (
        <div style={{ marginTop: spacing["5"] }}>
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  );
}

export function NoEventsEmpty({ onReplay }: { onReplay?: () => void }) {
  return (
    <EmptyState
      icon={<Database size={20}/>}
      title="No events yet"
      subtitle="The database is empty. Replay the bundled sample events to demonstrate the pipeline, or point EVE_FILE_PATH at a Suricata EVE JSON log."
      action={onReplay ? { label: "Replay sample events", onClick: onReplay } : null}
    />
  );
}

export function NoFilteredEvents() {
  return (
    <EmptyState
      icon={<AlertTriangle size={20}/>}
      title="No matching events"
      subtitle="Try loosening the current filters or clearing the search."
    />
  );
}
