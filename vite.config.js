import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
var host = process.env.TAURI_DEV_HOST;
// https://vitejs.dev/config/
export default defineConfig(function () { return ({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    // Tauri expects a fixed port and ignores HMR over LAN by default
    clearScreen: false,
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                protocol: "ws",
                host: host,
                port: 1421,
            }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: {
        target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
        minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
}); });
