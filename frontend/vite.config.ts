import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumBuild = 'node_modules/cesium/Build/Cesium'

// Cesium needs its Workers/Assets/Widgets served as static files.
export default defineConfig({
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
})
