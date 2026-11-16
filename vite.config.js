import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` produces one self-contained dist/index.html
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
