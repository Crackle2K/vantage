import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react(),
    // The plugin's verbose logger mis-renders absolute Windows paths as
    // dist/C:/... under Vite 8, even though emitted files are in dist/assets.
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', verbose: false }),
    viteCompression({ algorithm: 'gzip', ext: '.gz', verbose: false }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'router'
          if (id.includes('@react-oauth')) return 'google-oauth'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('gsap')) return 'gsap'
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
  publicDir: 'public',
})
