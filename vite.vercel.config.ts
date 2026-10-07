import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": resolve(__dirname, "build/vercel-cloudflare-shim.ts"),
    },
  },
  plugins: [vinext(), nitro()],
});
