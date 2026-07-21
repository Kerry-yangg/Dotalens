import { defineConfig } from "vite";

const parserProxy = {
  target: "http://127.0.0.1:5600",
  changeOrigin: false,
};

export default defineConfig({
  server: {
    proxy: { "/api": parserProxy },
  },
  preview: {
    proxy: { "/api": parserProxy },
  },
});
