import clsx from "clsx";
import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { borders, colors, radius, spacing, typography } from "../../tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "subtle";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const sizeMap = {
  sm: { pad: `${spacing["1.5"]} ${spacing["2.5"]}`, fs: typography.fontSize.xs, h: 28 },
  md: { pad: `${spacing["2.5"]} ${spacing["4"]}`, fs: typography.fontSize.sm, h: 34 },
};

const variantMap: Record<Variant, React.CSSProperties> = {
  primary: {
    background: colors.primary,
    color: "#fff",
    border: `1px solid ${colors.primary}`,
  },
  secondary: {
    background: colors.bgSurfaceElevated,
    color: colors.textPrimary,
    border: borders.strong,
  },
  danger: {
    background: colors.dangerBg,
    color: "#fecaca",
    border: `1px solid #5c1616`,
  },
  ghost: {
    background: "transparent",
    color: colors.textSecondary,
    border: `1px solid transparent`,
  },
  subtle: {
    background: colors.bgSurface,
    color: colors.textPrimary,
    border: borders.base,
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconRight, className, style, children, ...rest }, ref
) {
  const s = sizeMap[size];
  return (
    <button
      ref={ref}
      className={clsx("btn", className)}
      {...rest}
      style={{
        ...variantMap[variant],
        padding: s.pad,
        height: s.h,
        minHeight: s.h,
        fontSize: s.fs,
        fontWeight: typography.fontWeight.medium,
        borderRadius: radius.md,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing["2"],
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
        ...style,
      }}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
});
