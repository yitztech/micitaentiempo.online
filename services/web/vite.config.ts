import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    // En desarrollo el HMR va por su propio puerto (el gateway no hace de proxy de websockets).
    hmr: { port: 24678, clientPort: 24678 },
  },
});
