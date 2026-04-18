import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // @ts-expect-error Vite 8 SCSS modern API opt-in
        api: 'modern-compiler',
      },
    },
  },
})
