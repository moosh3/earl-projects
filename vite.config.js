import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        // Projects and blog pages will be auto-discovered
      }
    }
  },
  publicDir: 'public'
})
