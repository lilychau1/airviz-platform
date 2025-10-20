import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svg from '@poppanator/sveltekit-svg';

export default defineConfig({
  plugins: [
    svelte(),
    svg()
  ],
  build: {
    outDir: 'dist',
  },
  base: '/', 
});