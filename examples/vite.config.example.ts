/**
 * Example Vite configuration for Motion Canvas with cache plugin
 *
 * Add this to your vite.config.ts file to enable server-side caching
 */

import {defineConfig} from 'vite';
import motionCanvas from '@motion-canvas/vite-plugin';
import {motionCanvasCachePlugin} from 'motion-canvas-cache';

export default defineConfig({
  plugins: [
    motionCanvas(),

    // Add the cache plugin for server-side caching
    motionCanvasCachePlugin({
      // Optional: specify cache directory (default: 'motion-canvas-cache')
      cachePath: 'motion-canvas-cache',

      // Optional: maximum file size in MB (default: 50)
      maxFileSize: 50,
    }),
  ],
});
