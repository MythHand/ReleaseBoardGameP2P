import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Две точки входа:
//  - index.html            → реальное приложение (src/app)
//  - playground/index.html → песочница для изоляции компонентов/моментов
// Обе используют ОДНИ И ТЕ ЖЕ компоненты из src/.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        playground: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
      },
    },
  },
})
