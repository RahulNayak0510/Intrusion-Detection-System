// Design tokens — restrained, high-contrast SecOps palette
// Bright colors reserved for severity, status, and primary actions only.

export const colors = {
  // Neutrals (dark neutral background, no gradients, no glass)
  bgRoot: "#0b1020",
  bgSurface: "#11182b",
  bgSurfaceElevated: "#162038",
  bgSurfaceHover: "#1c2745",
  border: "#243156",
  borderStrong: "#31436f",
  textPrimary: "#e8ecf6",
  textSecondary: "#a7b0c8",
  textMuted: "#76819d",
  textDisabled: "#545d77",

  // Severity (bright, reserved for severity + actions)
  severityHigh: "#dc2626",
  severityMedium: "#f59e0b",
  severityLow: "#2563eb",
  severityUnknown: "#64748b",

  // Status / accents
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#0ea5e9",
  ack: "#059669",

  // Actions
  primary: "#4f46e5",
  primaryHover: "#4338ca",
  primaryActive: "#3730a3",
  dangerBg: "#7f1d1d",

  shadow: "0 1px 2px rgba(0,0,0,0.4)",
  shadowElevated: "0 2px 8px rgba(0,0,0,0.45)",
} as const;

export const typography = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  fontFamilyMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: {
    xs: "0.75rem",
    sm: "0.8125rem",
    base: "0.875rem",
    md: "0.9375rem",
    lg: "1.0625rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const spacing = {
  px: "1px",
  "0.5": "2px",
  "1": "4px",
  "1.5": "6px",
  "2": "8px",
  "2.5": "10px",
  "3": "12px",
  "3.5": "14px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
} as const;

export const radius = {
  sm: "2px",
  md: "4px",
  lg: "6px",
  xl: "8px",
  full: "9999px",
} as const;

export const borders = {
  base: `1px solid ${colors.border}`,
  strong: `1px solid ${colors.borderStrong}`,
  focus: `1px solid ${colors.primary}`,
  danger: `1px solid ${colors.severityHigh}`,
};

export const breakpoints = {
  md: "@media (min-width: 768px)",
  lg: "@media (min-width: 1024px)",
  xl: "@media (min-width: 1440px)",
};

export const severityTextColor = (s: string | null | undefined) => {
  switch (s?.toUpperCase()) {
    case "HIGH":
      return colors.severityHigh;
    case "MEDIUM":
      return colors.severityMedium;
    case "LOW":
      return colors.severityLow;
    default:
      return colors.severityUnknown;
  }
};

export const severityBgColor = (s: string | null | undefined) => {
  switch (s?.toUpperCase()) {
    case "HIGH":
      return "#3f1212";
    case "MEDIUM":
      return "#452a07";
    case "LOW":
      return "#0e2448";
    default:
      return "#1f2937";
  }
};
