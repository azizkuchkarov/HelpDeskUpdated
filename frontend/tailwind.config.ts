import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          50: "#e6f2fb",
          100: "#cde5f7",
          200: "#9bc9ef",
          300: "#6aaddf",
          400: "#3b92cf",
          500: "#136cb0", // brand blue
          600: "#105a93",
          700: "#0c426b",
          800: "#082a43",
          900: "#041526",
        },
        surface: {
          DEFAULT: "#ffffff",
          elevated: "#f8fafc",
          muted: "#f1f5f9",
        },
        sidebar: {
          // Deep brand navy based on primary 900
          DEFAULT: "#041526",
          // Soft blue hover using brand blue with low opacity
          hover: "rgba(19,108,176,0.22)",
          // Stronger brand blue for active item
          active: "rgba(19,108,176,0.38)",
          border: "rgba(255,255,255,0.06)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover":
          "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
        glow: "0 0 0 3px rgba(99, 102, 241, 0.25)",
        "sidebar-right": "4px 0 24px -4px rgb(0 0 0 / 0.12)",
      },
      borderRadius: {
        card: "1rem",
        "card-lg": "1.25rem",
        input: "0.5rem",
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};
export default config;
