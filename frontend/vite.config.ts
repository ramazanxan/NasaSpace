import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumBuild = 'node_modules/cesium/Build/Cesium'

// Cesium needs its Workers/Assets/Widgets served as static files.
export default defineConfig(({ mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? ''
  if (mode === 'production' && apiUrl && !apiUrl.startsWith('https://')) {
    throw new Error('VITE_API_URL must use https:// in production builds (mixed content is blocked)')
  }
  return {
    server: {
      // One public link for demos: the dev server forwards API calls to the Java backend,
      // and accepts requests coming through a Cloudflare quick tunnel.
      proxy: { '/api': { target: 'http://localhost:9090', changeOrigin: true } },
      allowedHosts: ['.trycloudflare.com'],
    },
    preview: {
      proxy: { '/api': { target: 'http://localhost:9090', changeOrigin: true } },
      allowedHosts: ['.trycloudflare.com'],
    },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: `${cesiumBuild}/{Workers,ThirdParty,Assets,Widgets}/**/*`,
          dest: 'cesium',
          // drop node_modules/cesium/Build/Cesium from the output path
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  build: {
    chunkSizeWarningLimit: 6000,
  },
  }
})
