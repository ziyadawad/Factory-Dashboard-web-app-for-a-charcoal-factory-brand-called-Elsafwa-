import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0F1A",
        card: "#141A2A",
        cardBorder: "#232B40",
        brandYellow: "#FFC107",
        brandOrange: "#FF7A00",
        brandDeepOrange: "#E53E00",
        brandBlue: "#2F80ED",
        statusGreen: "#22C55E",
        statusAmber: "#F59E0B",
        statusRed: "#EF4444",
      },
    },
  },
  plugins: [],
};
export default config;
