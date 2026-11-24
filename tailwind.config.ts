import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#142B4A",
        brand: { DEFAULT: "#2563EB", dark: "#1D4FBF", soft: "#E8F0FE" },
        surface: "#F5F7FB",
        ok: "#16A34A",
        warn: "#EA580C",
        danger: "#DC2626",
      },
      fontFamily: { sans: ["Plus Jakarta Sans Variable", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
