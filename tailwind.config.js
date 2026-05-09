import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // Default is dark; the explicit `.light` class on <html> activates the
  // light variant via the plugin below.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef9ff",
          100: "#daf1ff",
          200: "#bde7ff",
          300: "#8fd9ff",
          400: "#58c2ff",
          500: "#2ea4ff",
          600: "#1683f5",
          700: "#1369df",
          800: "#1655b3",
          900: "#184a8d",
          950: "#102d5a",
        },
        ink: {
          50: "#f6f7f9",
          100: "#ebedf2",
          200: "#d3d8e1",
          300: "#aab2c2",
          400: "#7c869b",
          500: "#5c6679",
          600: "#475061",
          700: "#3a414f",
          800: "#2a2f3a",
          900: "#1a1d24",
          950: "#0f1116",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        glow: "0 0 0 4px rgb(46 164 255 / 20%), 0 0 20px rgb(46 164 255 / 25%)",
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("light", ":where(html.light) &");
    }),
  ],
};
