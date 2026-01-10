/**
 * Basic usage example for motion-canvas-cache
 *
 * This example demonstrates how to use the cached() function
 * to cache files from URLs with custom metadata.
 */

import {makeScene2D, Img, Audio} from '@motion-canvas/2d';
import {cached} from 'motion-canvas-cache';

// Example 1: Use cached images in Motion Canvas
export const imageScene = makeScene2D(function* (view) {
  const imageUrl = await cached('https://example.com/image.png', {
    metadata: {
      width: 800,
      height: 600,
      title: 'Example Image',
    },
  });

  // Use directly in Motion Canvas components
  view.add(<Img src={imageUrl} />);
});

// Example 2: Cache audio with metadata
export const audioScene = makeScene2D(function* (view) {
  const audioUrl = await cached('https://example.com/audio.mp3', {
    metadata: {
      duration: 3.5,
      title: 'Example Audio',
    },
  });

  view.add(<Audio src={audioUrl} />);
});

// Example 3: Cache a blob directly using cacheBlob method
async function cacheBlobExample() {
  const {Cache, CacheUtils} = await import('motion-canvas-cache');

  const cache = Cache.getInstance();
  const myBlob = new Blob(['Hello, world!'], {type: 'text/plain'});

  // Generate a cache key
  const cacheKey = CacheUtils.generateCacheKey('user-content', ['text']);

  // Cache the blob
  const textUrl = await cache.cacheBlob(cacheKey, myBlob, {
    source: 'user-generated',
    timestamp: Date.now(),
  });

  console.log('Cached text URL:', textUrl);
}

// Example 4: Cache with custom cache key options
async function cacheWithOptions() {
  // These will have different cache keys even though the URL is the same
  const fastVersionUrl = await cached('https://api.example.com/generate', {
    cacheKeyOptions: ['fast', 'lowquality'],
    metadata: {speed: 'fast'},
  });

  const slowVersionUrl = await cached('https://api.example.com/generate', {
    cacheKeyOptions: ['slow', 'highquality'],
    metadata: {speed: 'slow'},
  });

  console.log('Fast version URL:', fastVersionUrl);
  console.log('Slow version URL:', slowVersionUrl);
}

// Example 5: Override MIME type
async function cacheWithMimeType() {
  const fileUrl = await cached('https://example.com/unknown-file', {
    mimeType: 'audio/mpeg', // Override auto-detected MIME type
    metadata: {
      format: 'mp3',
    },
  });

  console.log('Cached file URL:', fileUrl);
}
