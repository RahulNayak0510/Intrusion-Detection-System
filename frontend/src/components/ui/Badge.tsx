import { ReactNode } from "react";
import { colors, radius, severityBgColor, severityTextColor, spacing, typography } from "../../tokens";

export type BadgeTone = "high" | "medium" | "low" | "success" | "warning" | "info" | "default";

const toneBg: Record<BadgeTone, string> = {
  high: severityBgColor("HIGH"),
  medium: severityBgColor("MEDIUM"),
  low: severityBgColor("LOW"),
  success: "#052e1c",
  warning: "#452a07",
  info: "#072b48",
  default: "#1e293b",
};
const toneFg: Record<BadgeTone, string> = {
  high: severityTextColor("HIGH"),
  medium: severityTextColor("MEDIUM"),
  low: severityTextColor("LOW"),
  success: "#34d399",
  warning: "#fbbf24",
  info: "#7dd3fc",
  default: colors.textSecondary,
};
const toneBorder: Record<BadgeTone, string> = {
  high: "#7f1d1d",
  medium: "#78350f",
  low: "#1e3a8a",
  success: "#064e3b",
  warning: "#78350f",
  info: "#075985",
  default: "#334155",
};

export function severityToTone(s: string | null | undefined): BadgeTone {
  const up = String(s || "").toUpperCase();
  if (up === "HIGH") return "high";
  if (up === "MEDIUM") return "medium";
  if (up === "LOW") return "low";
  return "default";
}

export function Badge({
  tone = "default", children, icon,
}: { tone?: BadgeTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: spacing["1.5"],
        padding: `${spacing["0.5"]} ${spacing["2"]}`, borderRadius: radius.md,
        fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium,
        background: toneBg[tone], color: toneFg[tone],
        border: `1px solid ${toneBorder[tone]}`, lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
