import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2522",
        paper: "#f5f7f6",
        line: "#d7ded9",
        leaf: "#1d6b52",
        tomato: "#b6402f",
        yolk: "#f0c95a",
      },
      boxShadow: {
        soft: "0 12px 30px rgba(31, 37, 34, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
