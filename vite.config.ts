import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Domain logic shared verbatim with the Supabase Edge Functions, so the
      // browser and the server can never drift on scoring or validation.
      '@shared': path.resolve(__dirname, './supabase/functions/_shared'),
    },
  },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep the assessment runners on a small critical path. Charts, PDF
        // generation and the Supabase client are only needed on specific
        // routes, so they are split into their own chunks.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          pdf: ['jspdf'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
