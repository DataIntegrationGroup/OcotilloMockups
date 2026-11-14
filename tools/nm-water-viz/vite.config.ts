import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

// https://vite.dev/config/
export default defineConfig({
  // viteSingleFile inlines every JS/CSS chunk into dist/index.html.
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    // Kepler's packages declare their own React/styled-components; make sure
    // only one copy of each ends up in the bundle.
    dedupe: ['react', 'react-dom', 'react-intl', 'styled-components'],
  },
  build: {
    minify: true,
  },
});
