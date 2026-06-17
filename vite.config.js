import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pure static site. `npm run dev` first builds the gallery into public/gallery
// (see package.json) so the dev server can serve manifest.json + images.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
