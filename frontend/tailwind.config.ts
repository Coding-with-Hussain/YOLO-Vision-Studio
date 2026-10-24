import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        sidebar: token("sidebar"),
        card: { DEFAULT: token("card"), foreground: token("foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("foreground") },
        elevated: token("elevated"),
        border: token("border"),
        input: token("input"),
        ring: token("primary"),
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("elevated"), foreground: token("foreground") },
        cyan: { DEFAULT: token("cyan") },
        success: { DEFAULT: token("success") },
        warning: { DEFAULT: token("warning") },
        destructive: { DEFAULT: token("danger"), foreground: token("primary-foreground") },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--primary) / 0.35), 0 8px 28px -6px rgb(var(--primary) / 0.45)",
        "glow-sm": "0 0 18px -4px rgb(var(--primary) / 0.55)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 12px 32px -18px rgb(0 0 0 / 0.6)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--success) / 0.55)" },
          "70%": { boxShadow: "0 0 0 6px rgb(var(--success) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--success) / 0)" },
        },
        indeterminate: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(250%)" },
        },
        scan: {
          "0%": { top: "-6rem" },
          "100%": { top: "100%" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 2s infinite",
        indeterminate: "indeterminate 1.4s ease-in-out infinite",
        scan: "scan 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
