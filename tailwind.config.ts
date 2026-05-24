// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  safelist: [{ pattern: /.*/ }],
  theme: {
    extend: {
      colors: {
        page: "#0d1117",
        panel: "#1a1d24",
        surface: "#1f2937",
        "border-dark": "#2a2d35",
        "border-mid": "#374151",
        accent: "#6366f1",
        "accent-dark": "#4f46e5",
      },
    },
  },
};

export default config;
