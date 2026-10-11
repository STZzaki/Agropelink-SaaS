import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // three.js (~690 kB sin comprimir, 177 kB gzip) no admite tree-shaking con R3F v8 y supera el aviso por
    // defecto (500 kB). Es un chunk de proveedor diferido (solo landing, tras el primer pintado y en reposo):
    // se sube el umbral justo por encima para que cualquier OTRO chunk que crezca siga avisando.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Dependencias estables en chunks propios: se cachean entre despliegues de la app.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          gsap: ['gsap', 'gsap/ScrollTrigger', '@gsap/react'],
          // Motor 3D del "Scroll World": solo se descarga en la landing, tras el primer pintado y en reposo.
          three: ['three'],
          r3f: ['@react-three/fiber'],
          // Gráficas del panel del agricultor (solo se descargan al abrir el dashboard).
          charts: ['recharts'],
        },
      },
    },
  },
})
