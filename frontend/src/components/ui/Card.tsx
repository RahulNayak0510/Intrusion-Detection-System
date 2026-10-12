import { ReactNode } from "react";
import { borders, colors, radius, spacing, typography } from "../../tokens";

export function Card({ title, subtitle, icon, action, children, style }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{
      background: colors.bgSurface,
      border: borders.base,
      borderRadius: radius.lg,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}>
      {title && (
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${spacing["4"]} ${spacing["5"]}`,
          borderBottom: borders.base, background: colors.bgSurfaceElevated,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing["2.5"], minWidth: 0 }}>
            {icon && (
              <div style={{
                width: 28, height: 28, borderRadius: radius.md,
                background: "#162342", border: `1px solid ${colors.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: colors.textSecondary, flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, minWidth: 0 }}>
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div style={{ padding: title ? spacing["5"] : spacing["4"], display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </div>
    </section>
  );
}

export function Grid({ cols = 1, children, gap = spacing["5"] }: {
  cols?: number | { default: number; md?: number; lg?: number; xl?: number };
  children: ReactNode;
  gap?: string;
}) {
  let colCss: React.CSSProperties;
  if (typeof cols === "number") {
    colCss = { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap };
  } else {
    colCss = {
      display: "grid",
      gap,
      "--grid-cols-default": cols.default,
      "--grid-cols-md": cols.md ?? cols.default,
      "--grid-cols-lg": cols.lg ?? cols.md ?? cols.default,
      "--grid-cols-xl": cols.xl ?? cols.lg ?? cols.md ?? cols.default,
    } as React.CSSProperties;
  }
  return (
    <div className={typeof cols === "object" ? "responsive-grid" : undefined} style={colCss}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default", icon }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "high" | "medium" | "low" | "success";
  icon?: ReactNode;
}) {
  const accent =
    tone === "high" ? "#fecaca" :
    tone === "medium" ? "#fcd34d" :
    tone === "low" ? "#93c5fd" :
    tone === "success" ? "#86efac" : colors.textPrimary;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: spacing["5"], background: colors.bgSurface, border: borders.base, borderRadius: radius.lg,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium, letterSpacing: 0.04, textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{
          fontSize: "1.875rem", lineHeight: 1.1, fontWeight: typography.fontWeight.bold,
          color: accent, marginTop: spacing["1.5"], fontVariantNumeric: "tabular-nums",
        }}>
          {value}
        </div>
        {hint && (
          <div style={{ fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: spacing["2"] }}>
            {hint}
          </div>
        )}
      </div>
      {icon && (
        <div style={{
          width: 36, height: 36, borderRadius: radius.md,
          background: colors.bgSurfaceElevated, border: borders.base,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: colors.textMuted, flexShrink: 0,
        }}>
          {icon}
        </div>
      )}
    </div>
  );
}
