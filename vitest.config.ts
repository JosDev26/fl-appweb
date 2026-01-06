import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['node_modules', '.next'],
      env: env, // Pass all environment variables to tests
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  }
})
