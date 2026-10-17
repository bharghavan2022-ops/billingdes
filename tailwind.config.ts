import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // The invoice screens keep the original hand-tuned stylesheet (src/app/legacy.css),
  // so Tailwind's reset is off to avoid restyling them. Tailwind utilities are available for new UI.
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
export default config;
