import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The leaderboard API runs as its own Node process (server/index.js) so records persist in a real
// SQLite database independent of any browser — this proxy just makes it reachable same-origin.
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:4001",
    },
  },
});
