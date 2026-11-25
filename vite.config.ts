import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: o mesmo build funciona na Vercel e dentro do app (Capacitor)
  base: './',
  build: { outDir: 'dist', sourcemap: false },
})
