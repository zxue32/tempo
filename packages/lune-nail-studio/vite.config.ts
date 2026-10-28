import { defineConfig } from 'vite';
export default defineConfig({ build: { copyPublicDir: false, lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'lune-nail-studio.js' }, target:'es2022', sourcemap: true } });
