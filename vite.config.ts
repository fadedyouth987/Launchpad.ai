import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The browser needs the Neon Auth URL. `neon env pull`/`neon deploy` write NEON_AUTH_BASE_URL to
  // .env.local; expose it as VITE_NEON_AUTH_URL unless that is set explicitly. (Only this public URL
  // is exposed; DATABASE_URL and other server variables never reach the bundle.)
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const neonAuthUrl = env.VITE_NEON_AUTH_URL || env.NEON_AUTH_BASE_URL || '';
  return {
    plugins: [react(), tailwindcss()],
    define: { 'import.meta.env.VITE_NEON_AUTH_URL': JSON.stringify(neonAuthUrl) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Client output only; the server bundle goes to dist/server.cjs and is never served.
      outDir: 'dist/public',
      emptyOutDir: true,
      sourcemap: false,
      // three.js is a lazy chunk (3D viewer) slightly above 500 kB.
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          // Large libraries get their own long-cacheable chunks; tabs are split with React.lazy.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(@neon\/auth|better-auth|@better-auth|@better-fetch|nanostores|jose)\//.test(id))
              return 'vendor-auth';
            if (/node_modules\/three\//.test(id)) return 'vendor-three';
            if (
              /node_modules\/(recharts|d3-|victory-vendor|internmap|decimal\.js-light|es-toolkit|reselect|@reduxjs|redux|immer|react-redux|use-sync-external-store)/.test(
                id,
              )
            )
              return 'vendor-charts';
            if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'vendor-motion';
            if (/node_modules\/lucide-react\//.test(id)) return 'vendor-icons';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
