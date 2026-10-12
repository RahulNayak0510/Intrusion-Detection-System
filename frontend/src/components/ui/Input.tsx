import { ForwardedRef, forwardRef, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { borders, colors, radius, spacing, typography } from "../../tokens";

const inputBase: React.CSSProperties = {
  background: colors.bgSurface,
  border: borders.base,
  color: colors.textPrimary,
  padding: `${spacing["2.5"]} ${spacing["3"]}`,
  borderRadius: radius.md,
  fontSize: typography.fontSize.sm,
  lineHeight: 1.4,
  outline: "none",
  transition: "border-color 120ms ease, background 120ms ease",
  width: "100%",
};

const inputHover = (el: HTMLElement) => { el.style.borderColor = colors.borderStrong; };
const inputBlur = (el: HTMLElement) => { el.style.borderColor = colors.border; };
const inputFocus = (el: HTMLElement) => { el.style.borderColor = colors.primary; el.style.background = colors.bgSurfaceElevated; };

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref: ForwardedRef<HTMLInputElement>) {
  return (
    <input
      {...props}
      ref={ref}
      style={{ ...inputBase, ...(props.style || {}), height: 36 }}
      onMouseEnter={(e) => { inputHover(e.currentTarget); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { inputBlur(e.currentTarget); props.onMouseLeave?.(e); }}
      onFocus={(e) => { inputFocus(e.currentTarget); props.onFocus?.(e); }}
      onBlur={(e) => { inputBlur(e.currentTarget); props.onBlur?.(e); }}
    />
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      style={{ ...inputBase, ...(props.style || {}), minHeight: 88, resize: "vertical" }}
      onMouseEnter={(e) => { inputHover(e.currentTarget); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { inputBlur(e.currentTarget); props.onMouseLeave?.(e); }}
      onFocus={(e) => { inputFocus(e.currentTarget); props.onFocus?.(e); }}
      onBlur={(e) => { inputBlur(e.currentTarget); props.onBlur?.(e); }}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return (
    <select
      {...props}
      ref={ref}
      style={{
        ...inputBase,
        ...(props.style || {}),
        height: 36,
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path fill='%23a7b0c8' d='M3 4.5L6 7.5 9 4.5z'/></svg>")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        paddingRight: 30,
        color: colors.textPrimary,
      }}
      onMouseEnter={(e) => { inputHover(e.currentTarget); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { inputBlur(e.currentTarget); props.onMouseLeave?.(e); }}
      onFocus={(e) => { inputFocus(e.currentTarget); props.onFocus?.(e); }}
      onBlur={(e) => { inputBlur(e.currentTarget); props.onBlur?.(e); }}
    />
  );
});

export function Label({ htmlFor, children, required }: { htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        marginBottom: spacing["1.5"],
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
        color: colors.textSecondary,
        letterSpacing: 0.02,
      }}
    >
      {children} {required && <span style={{ color: colors.severityHigh }}>*</span>}
    </label>
  );
}
