import {CacheUtils} from './CacheUtils';

// Vite HMR types
declare global {
  interface ImportMeta {
    hot?: {
      on: (event: string, callback: (data: any) => void) => void;
      send: (event: string, data: any) => void;
    };
  }
}

export interface CachedResult {
  url: string;
  metadata?: Record<string, any>;
}

type CacheKey = string;

/**
 * Options for caching operations
 */
export interface CacheOptions {
  cacheKey?: string;
  metadata?: Record<string, any>;
  mimeType?: string;
  fetchOptions?: RequestInit;
}

/**
 * Cache options with required cacheKey (used by cacheBlob and cacheArrayBuffer)
 */
export interface CacheOptionsWithKey extends Omit<CacheOptions, 'cacheKey' | 'fetchOptions'> {
  cacheKey: string;
}

export class Cache {
  private static instance: Cache | null = null;
  private cache = new Map<CacheKey, CachedResult>();
  private pendingRequests = new Map<
    CacheKey,
    {
      resolve: (result: CachedResult | null) => void;
      reject: (error: any) => void;
    }
  >();
  private serverAvailablePromise: Promise<boolean> | null = null;

  private constructor() {}

  public static getInstance(): Cache {
    if (!Cache.instance) {
      Cache.instance = new Cache();
      Cache.instance.initializeHMR();
    }

    return Cache.instance;
  }

  private initializeHMR(): void {
    if (import.meta.hot) {
      // Initialize server availability promise
      this.serverAvailablePromise = new Promise((resolve) => {
        // Check if server plugin is available
        console.log('Checking Motion Canvas Cache server plugin availability...');
        import.meta.hot!.send('cache:check-available', {});

        // Set timeout
        const timeoutId = setTimeout(() => {
            console.log('Motion Canvas Cache server plugin not available (timeout)');
            resolve(false);
        }, 500); // 0.5 second timeout

        // Listen for server availability response
        import.meta.hot!.on('cache:available', () => {
          console.log('Motion Canvas Cache server plugin is available');
          clearTimeout(timeoutId);
          resolve(true);
        });
      });

      // Listen for responses from the server
      import.meta.hot.on('cache:upload-success', (data: any) => {
        const {cacheKey, filePath, metadata} = data;
        if (cacheKey && filePath) {
          const result = {url: filePath, metadata};

          // Update in-memory cache
          this.cache.set(cacheKey, result);
          console.log(`Server upload successful for ${cacheKey}`);

          // Resolve pending request if any
          const pending = this.pendingRequests.get(cacheKey);
          if (pending) {
            pending.resolve(result);
            this.pendingRequests.delete(cacheKey);
          }
        }
      });

      import.meta.hot.on('cache:upload-error', (data: any) => {
        const {cacheKey, error} = data;
        console.error(`Server upload failed for ${cacheKey}:`, error);

        // Reject pending request if any
        const pending = this.pendingRequests.get(cacheKey);
        if (pending) {
          pending.reject(new Error(error));
          this.pendingRequests.delete(cacheKey);
        }
      });

      import.meta.hot.on('cache:file-exists', (data: any) => {
        const {cacheKey, filePath, metadata} = data;
        if (cacheKey && filePath) {
          const result = {url: filePath, metadata};
          this.cache.set(cacheKey, result);

          console.log(
            `Found existing cached file for ${cacheKey} at ${filePath}`,
          );

          // Resolve pending request if any
          const pending = this.pendingRequests.get(cacheKey);
          if (pending) {
            pending.resolve(result);
            this.pendingRequests.delete(cacheKey);
          }
        }
      });

      import.meta.hot.on('cache:file-not-found', (data: any) => {
        const {cacheKey} = data;
        console.log(`File not found on server for ${cacheKey}`);

        // Resolve with null to indicate not found
        const pending = this.pendingRequests.get(cacheKey);
        if (pending) {
          pending.resolve(null);
          this.pendingRequests.delete(cacheKey);
        }
      });

    }
  }


  public get(cacheKey: CacheKey): CachedResult | null {
    return this.cache.get(cacheKey) ?? null;
  }

  /**
   * Check if a cache key exists in memory cache (synchronous)
   *
   * @param cacheKey - The cache key to check
   * @returns true if the key exists in memory cache
   */
  public has(cacheKey: CacheKey): boolean {
    return this.cache.has(cacheKey);
  }

  private set(cacheKey: CacheKey, result: CachedResult): void {
    this.cache.set(cacheKey, result);
  }

  public cacheResult(cacheKey: CacheKey, url: string, metadata?: Record<string, any>): void {
    this.set(cacheKey, { url, metadata });
  }

  /**
   * Cache a Blob (base caching method)
   *
   * @param blob - The Blob to cache
   * @param options - Cache options (cacheKey is required, metadata, mimeType)
   * @returns The blob URL that can be used to reference the cached blob
   */
  public async cacheBlob(
    blob: Blob,
    options: CacheOptionsWithKey,
  ): Promise<string> {
    const finalMimeType = options.mimeType || blob.type || 'application/octet-stream';
    const {cacheKey} = options;

    // Create a blob URL for in-memory cache
    const blobUrl = URL.createObjectURL(blob);

    // Cache in memory
    this.cacheResult(cacheKey, blobUrl, options.metadata);

    // Upload to server cache (async, non-blocking)
    // Convert to ArrayBuffer for server upload
    blob.arrayBuffer().then(arrayBuffer => {
      this.uploadToServer(cacheKey, arrayBuffer, finalMimeType, options.metadata).catch(error => {
        console.warn('Failed to upload to server cache:', error);
      });
    });

    return blobUrl;
  }

  /**
   * Cache an ArrayBuffer (calls cacheBlob)
   *
   * @param arrayBuffer - The ArrayBuffer to cache
   * @param options - Cache options (cacheKey is required, metadata, mimeType)
   * @returns The blob URL that can be used to reference the cached data
   */
  public async cacheArrayBuffer(
    arrayBuffer: ArrayBuffer,
    options: CacheOptionsWithKey,
  ): Promise<string> {
    const mimeType = options.mimeType || 'application/octet-stream';
    const {cacheKey} = options;
    const blob = new Blob([arrayBuffer], {type: mimeType});

    // Create a blob URL for in-memory cache
    const blobUrl = URL.createObjectURL(blob);

    // Cache in memory
    this.cacheResult(cacheKey, blobUrl, options.metadata);

    // Upload to server cache (async, non-blocking)
    this.uploadToServer(cacheKey, arrayBuffer, mimeType, options.metadata).catch(error => {
      console.warn('Failed to upload to server cache:', error);
    });

    return blobUrl;
  }

  /**
   * Cache a URL by fetching and caching the response (calls cacheArrayBuffer)
   *
   * @param input - The URL to fetch and cache (string, URL object, or Request object)
   * @param options - Cache options (cacheKey, metadata, mimeType, fetchOptions)
   * @returns The blob URL that can be used to reference the cached data
   */
  public async cacheUrl(
    input: string | URL,
    options: CacheOptions = {},
  ): Promise<string> {
    // Convert input to string URL
    const urlString = input instanceof URL ? input.toString() : input;

    // Generate cache key if not provided
    const cacheKey = options.cacheKey || CacheUtils.generateCacheKey(urlString, []);

    // Check in-memory cache first
    const cachedResult = this.get(cacheKey);
    if (cachedResult) {
      console.log(`Found in memory cache for ${cacheKey}`);
      return cachedResult.url;
    }

    // Check server cache
    const serverResult = await this.checkServerCache(cacheKey);
    if (serverResult) {
      console.log(`Found in server cache for ${cacheKey}`);
      return serverResult.url;
    }

    // Not in cache - fetch from URL
    console.log(`Fetching from URL: ${urlString}`);

    // Fetch with optional fetchOptions
    const response = options.fetchOptions
        ? await fetch(urlString, options.fetchOptions)
        : await fetch(urlString);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${urlString}: ${response.status} ${response.statusText}`);
    }

    // Auto-detect MIME type from response headers if not provided
    const contentType = response.headers.get('content-type');
    const mimeType = options.mimeType || contentType || 'application/octet-stream';

    const arrayBuffer = await response.arrayBuffer();

    return this.cacheArrayBuffer(arrayBuffer, {
      cacheKey,
      metadata: options.metadata,
      mimeType,
    });
  }

  public async checkServerCache(
    cacheKey: CacheKey,
  ): Promise<CachedResult | null> {
    if (!import.meta.hot) {
      return null;
    }

    // Wait for server availability with timeout
    const serverAvailable = await this.serverAvailablePromise;

    if (!serverAvailable) {
      return null;
    }

    return new Promise((resolve, reject) => {
      // Store the promise callbacks
      this.pendingRequests.set(cacheKey, {resolve, reject});

      // Send request via HMR
      import.meta.hot!.send('cache:check-file', {cacheKey});

      // Timeout after one second
      setTimeout(() => {
        if (this.pendingRequests.has(cacheKey)) {
          this.pendingRequests.delete(cacheKey);
          resolve(null); // Treat timeout as not found
        }
      }, 1000);
    });
  }

  public async uploadToServer(
    cacheKey: CacheKey,
    data: ArrayBuffer,
    mimeType: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!import.meta.hot) {
      console.warn('HMR not available for server upload');
      return;
    }

    // Wait for server availability with timeout
    const serverAvailable = await this.serverAvailablePromise;
    if (!serverAvailable) {
      console.log('Server plugin not available, skipping upload');
      return;
    }

    // Convert ArrayBuffer to base64 data URL
    const blob = new Blob([data], {type: mimeType});
    const dataUrl = await CacheUtils.blobToDataUrl(blob);

    // Send via HMR
    import.meta.hot.send('cache:upload-file', {
      data: dataUrl,
      mimeType,
      cacheKey,
      metadata: metadata || {},
    });
  }

  public streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
    return CacheUtils.streamToArrayBuffer(stream);
  }
}

export interface CachedOptions {
  metadata?: Record<string, any>;
  mimeType?: string;
  cacheKeyOptions?: string[];
  cacheKey?: string;
  fetchOptions?: RequestInit;
}

/**
 * Async function to fetch and cache a file from a URL
 *
 * @param input - URL to fetch (string, URL object, or Request object)
 * @param options - Optional configuration
 *   - metadata: Custom metadata to store with the cached file
 *   - mimeType: Override MIME type (auto-detected if not provided)
 *   - cacheKeyOptions: Additional options for cache key generation
 *   - cacheKey: Override the automatically generated cache key
 *   - fetchOptions: Additional options to pass to fetch()
 * @returns Promise that resolves to the cached URL (blob URL or server path)
 *
 * @example
 * // In Motion Canvas, use yield to await the promise
 * export default makeScene2D(function* (view) {
 *   // Preload the image
 *   yield cache('https://example.com/image.png', {
 *     metadata: { width: 800, height: 600 },
 *     mimeType: 'image/png'
 *   });
 *
 *   // Use synchronously in JSX
 *   view.add(<Img src={cached('https://example.com/image.png')} />);
 * });
 *
 * @example
 * // Cache with URL object
 * const url = new URL('https://example.com/image.png');
 * yield cache(url);
 *
 *
 * @example
 * // Cache with fetch options
 * yield cache('https://api.tts.com/generate', {
 *   fetchOptions: {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({text: 'Hello'}),
 *   },
 *   metadata: { duration: 3.5 }
 * });
 */
export async function cache(
  input: string | URL,
  options: CachedOptions = {}
): Promise<string> {
  const cacheInstance = Cache.getInstance();

  // Convert input to string URL for cache key generation
  const urlString = input instanceof URL ? input.toString() : input;

  // Warn if both cacheKey and cacheKeyOptions are provided
  if (options.cacheKey && options.cacheKeyOptions && options.cacheKeyOptions.length > 0) {
    console.warn('Both cacheKey and cacheKeyOptions were provided. cacheKeyOptions will be ignored.');
  }

  // Generate cache key if not provided
  const cacheKey = options.cacheKey || CacheUtils.generateCacheKey(urlString, options.cacheKeyOptions || []);

  // Delegate to cacheUrl (which handles all input types)
  return cacheInstance.cacheUrl(input, {
    cacheKey,
    metadata: options.metadata,
    mimeType: options.mimeType,
    fetchOptions: options.fetchOptions,
  });
}

/**
 * Synchronously get a cached URL (no async/yield needed)
 *
 * @param input - URL to check (string, URL object, or Request object)
 * @param options - Optional configuration (same as cache function)
 * @returns The cached URL if found, otherwise null
 *
 * @example
 * // Use directly in JSX without yield
 * export default makeScene2D(function* (view) {
 *   // Preload first
 *   yield cache('https://example.com/image.png');
 *
 *   // Use synchronously in JSX - no yield needed!
 *   view.add(<Img src={cached('https://example.com/image.png')} />);
 * });
 *
 * @example
 * // Conditional loading
 * export default makeScene2D(function* (view) {
 *   const url = 'https://example.com/image.png';
 *
 *   if (!cached(url)) {
 *     yield cache(url);
 *   }
 *
 *   view.add(<Img src={cached(url)} />);
 * });
 */
export function cached(
  input: string | URL,
  options: CachedOptions = {}
): string | null {
  const cacheInstance = Cache.getInstance();

  // Convert input to string for cache key generation
  let urlString: string;
  if (input instanceof URL) {
    urlString = input.toString();
  } else {
    urlString = input;
  }

  // Use provided cache key or generate from URL and options
  const cacheKey = options.cacheKey || CacheUtils.generateCacheKey(urlString, options.cacheKeyOptions || []);

  // Check in-memory cache only (synchronous)
  const cachedResult = cacheInstance.get(cacheKey);
  return cachedResult ? cachedResult.url : null;
}
