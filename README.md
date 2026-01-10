# Motion Canvas Cache

A generic file caching library for Motion Canvas projects that provides both in-memory and server-side caching via Vite's HMR WebSocket.

## Features

- **Dual-layer caching**: In-memory cache for fast access + server-side cache for persistence
- **Simple API**: Single `cached()` function that handles everything
- **URL or Blob support**: Cache files from URLs or directly from Blob objects
- **Auto MIME type detection**: Automatically detects content type from response headers
- **Custom metadata**: Store arbitrary metadata alongside cached files
- **HMR persistence**: Cache persists across hot module reloads
- **Works standalone**: In-memory cache works even without the server plugin
- **Generic file support**: Supports any file type (audio, video, images, documents, etc.)

## Installation

```bash
npm install motion-canvas-cache
```

## Usage

### 1. Enable the Vite Plugin

Add the plugin to your `vite.config.ts`:

```typescript
import {defineConfig} from 'vite';
import motionCanvas from '@motion-canvas/vite-plugin';
import {motionCanvasCachePlugin} from 'motion-canvas-cache';

export default defineConfig({
  plugins: [
    motionCanvas(),
    motionCanvasCachePlugin({
      cachePath: 'motion-canvas-cache', // Optional: default cache directory
      maxFileSize: 50, // Optional: max file size in MB (default: 50)
    }),
  ]
});
```

### 2. Use in Motion Canvas

Since Motion Canvas uses generator functions and you can't use `yield*` inside JSX, the pattern is:

1. **Preload assets** at the beginning of your scene using `yield cache()`
2. **Use synchronously** in JSX with `cached()`

```typescript
import {makeScene2D, Img, Audio} from '@motion-canvas/2d';
import {cache, cached} from 'motion-canvas-cache';

export default makeScene2D(function* (view) {
  // 1. Preload all assets at the beginning using yield
  yield cache('https://example.com/image.png', {
    metadata: {width: 800, height: 600},
  });

  yield cache('https://example.com/audio.mp3', {
    metadata: {duration: 3.5},
  });

  // 2. Use synchronously in JSX - no yield needed!
  view.add(
    <Img src={cached('https://example.com/image.png')} />
  );

  view.add(
    <Audio src={cached('https://example.com/audio.mp3')} />
  );
});
```

**Alternative: Preload in variables first**

```typescript
export default makeScene2D(function* (view) {
  // Preload and store in variables
  const imageUrl = yield cache('https://example.com/image.png');
  const audioUrl = yield cache('https://example.com/audio.mp3');

  // Use directly in JSX
  view.add(<Img src={imageUrl} />);
  view.add(<Audio src={audioUrl} />);
});
```

### 3. Conditional Loading

If you need to check if something is cached before loading:

```typescript
export default makeScene2D(function* (view) {
  const url = 'https://example.com/image.png';

  // Check if already cached (synchronous)
  if (!cached(url)) {
    // Not cached yet, load it
    yield cache(url);
  }

  // Now use it in JSX
  view.add(<Img src={cached(url)} />);
});
```

### Advanced Usage

#### Cache with custom MIME type override
```typescript
export default makeScene2D(function* (view) {
  // Preload with custom MIME type
  yield cache('https://example.com/file', {
    mimeType: 'audio/mpeg', // Override auto-detected MIME type
    metadata: {duration: 5.2, title: 'My Audio'},
  });

  // Use in JSX
  view.add(<Audio src={cached('https://example.com/file')} />);
});
```

#### Cache a Blob directly
```typescript
import {Cache, CacheUtils, cached} from 'motion-canvas-cache';

export default makeScene2D(function* (view) {
  const cache = Cache.getInstance();
  const myBlob = new Blob(['content'], {type: 'text/plain'});

  // Generate a cache key
  const cacheKey = CacheUtils.generateCacheKey('my-content', ['text']);

  // Cache the blob (use yield* in Motion Canvas)
  yield* cache.cacheBlob(cacheKey, myBlob, {
    source: 'user-generated',
  });

  // Use the cached result
  const textUrl = cache.get(cacheKey).url;
});
```

#### Custom cache key options
```typescript
export default makeScene2D(function* (view) {
  const baseUrl = 'https://api.example.com/audio';

  // Preload different variants
  yield cache(baseUrl, {
    cacheKeyOptions: ['fast', 'lowquality'],
    metadata: {speed: 'fast'},
  });

  yield cache(baseUrl, {
    cacheKeyOptions: ['slow', 'highquality'],
    metadata: {speed: 'slow'},
  });

  // Use them
  const fastUrl = cached(baseUrl, {cacheKeyOptions: ['fast', 'lowquality']});
  const slowUrl = cached(baseUrl, {cacheKeyOptions: ['slow', 'highquality']});
});
```

#### Override cache key completely
```typescript
export default makeScene2D(function* (view) {
  // Cache with custom key
  yield cache('https://api.tts.com/generate?text=hello', {
    cacheKey: 'my-custom-cache-key',
    metadata: {duration: 2.5},
  });

  // Retrieve with same custom key
  const audioUrl = cached('https://api.tts.com/generate?text=hello', {
    cacheKey: 'my-custom-cache-key',
  });

  // Note: If both cacheKey and cacheKeyOptions are provided,
  // cacheKeyOptions will be ignored and a warning will be logged
});
```

#### Use URL or Request objects
```typescript
export default makeScene2D(function* (view) {
  // With URL object
  const url = new URL('https://example.com/image.png');
  yield cache(url);
  view.add(<Img src={cached(url)} />);

  // With Request object (for POST requests, custom headers, etc.)
  const request = new Request('https://api.tts.com/generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text: 'Hello world'}),
  });

  yield cache(request, {
    cacheKey: 'hello-world-audio',
    metadata: {duration: 2.5},
  });

  const audioUrl = cached(request, {cacheKey: 'hello-world-audio'});
});
```

#### Custom fetch options
```typescript
export default makeScene2D(function* (view) {
  // Preload with fetch options
  yield cache('https://api.tts.com/generate', {
    fetchOptions: {
      method: 'POST',
      headers: {'Authorization': 'Bearer token123'},
      body: JSON.stringify({text: 'Hello'}),
    },
    metadata: {duration: 3.5},
  });

  // Use the cached result
  const audioUrl = cached('https://api.tts.com/generate');
  view.add(<Audio src={audioUrl} />);
});
```

## How It Works

1. **First call**: When you call `cache()` with a URL:
   - Checks in-memory cache first
   - Checks server cache via HMR WebSocket
   - If not cached, fetches from URL
   - Stores in both memory and server cache
   - Returns the cached URL (blob URL or server path)

2. **Subsequent calls**: Same cache key returns instantly from memory or server cache

3. **HMR updates**: Cache persists across hot module reloads for fast development

## API Reference

### `cache(input, options?)`

Async function to fetch and cache URLs. **Use with `yield` in Motion Canvas.**

**Parameters:**
- `input`: `string | URL | Request` - URL to fetch and cache
  - `string` - URL as string
  - `URL` - URL object
  - `Request` - Request object (for POST, custom headers, etc.)
- `options`: `CachedOptions` (optional)
  - `metadata?: Record<string, any>` - Custom metadata to store
  - `mimeType?: string` - Override MIME type (auto-detected if not provided)
  - `cacheKeyOptions?: string[]` - Additional options for cache key generation
  - `cacheKey?: string` - Override the automatically generated cache key (if provided, `cacheKeyOptions` will be ignored)
  - `fetchOptions?: RequestInit` - Additional options to pass to fetch() (method, headers, body, etc.)

**Returns:** `Promise<string>` - The cached URL (blob URL or server path) ready to use in Motion Canvas components

**Usage:** `const url = yield cache('https://...');`

### `cached(input, options?)`

Synchronously get a cached URL. **No `yield` needed - use directly in JSX!**

**Parameters:**
- Same as `cache()`

**Returns:** `string | null` - The cached URL if found, otherwise null

**Usage:** `const url = cached('https://...'); // No yield needed!`

### `Cache` class

Singleton cache manager.

**Methods:**
- `Cache.getInstance()` - Get the singleton instance
- `get(cacheKey)` - Get cached result
- `cacheResult(cacheKey, url, metadata?)` - Store URL in memory cache
- `cacheBlob(cacheKey, blob, metadata?, mimeType?)` - Cache a Blob with optional metadata and MIME type
- `checkServerCache(cacheKey)` - Check server cache
- `uploadToServer(cacheKey, data, mimeType, metadata?)` - Upload to server

### `CacheUtils` class

Utility functions for cache operations.

**Methods:**
- `CacheUtils.generateCacheKey(content, opts?)` - Generate 8-character hex cache key
- `CacheUtils.blobToDataUrl(blob)` - Convert Blob to base64 data URL
- `CacheUtils.streamToArrayBuffer(stream)` - Convert ReadableStream to ArrayBuffer

## Integration with Motion Canvas Narrator

This library was extracted from the motion-canvas-narrator project and can be reused there. Example integration:

```typescript
// In your narrator provider (generator function)
import {cache, cached} from 'motion-canvas-cache';

function* generateAudio(text: string, voiceId: string, modelId: string) {
  const url = 'https://api.example.com/tts';

  // Check if already cached
  const cachedUrl = cached(url, {
    cacheKeyOptions: [text, voiceId, modelId],
  });

  if (cachedUrl) {
    return cachedUrl;
  }

  // Cache with audio duration metadata and return the cached URL
  return yield cache(url, {
    fetchOptions: {
      method: 'POST',
      body: JSON.stringify({text, voice: voiceId}),
    },
    metadata: {duration: 3.5},
    cacheKeyOptions: [text, voiceId, modelId], // Unique per text/voice/model
  });
}
```

## Cache Directory Structure

Server-side cached files are stored as:

```
motion-canvas-cache/
├── 20fac170.mp3           # Cached file (8-char hash + extension)
├── 20fac170.meta.json     # Metadata file
├── a1b2c3d4.png
├── a1b2c3d4.meta.json
└── ...
```

Metadata file example:
```json
{
  "cacheKey": "20fac170",
  "mimeType": "audio/mpeg",
  "fileSize": 55296,
  "fileName": "20fac170.mp3",
  "createdAt": "2024-01-01T12:00:00.000Z",
  "duration": 3.5
}
```

## Cleanup

To clear the server cache, visit:
```
http://localhost:9000/__cache-cleanup
```

## Contributing

Contributions are welcome! Please open issues or pull requests.

## License

MIT
