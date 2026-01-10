import { CacheUtils } from './CacheUtils';
export class Cache {
    static { this.instance = null; }
    constructor() {
        this.cache = new Map();
        this.pendingRequests = new Map();
        this.serverAvailablePromise = null;
    }
    static getInstance() {
        if (!Cache.instance) {
            Cache.instance = new Cache();
            Cache.instance.initializeHMR();
        }
        return Cache.instance;
    }
    initializeHMR() {
        if (import.meta.hot) {
            // Initialize server availability promise
            this.serverAvailablePromise = new Promise((resolve) => {
                // Check if server plugin is available
                console.log('Checking Motion Canvas Cache server plugin availability...');
                import.meta.hot.send('cache:check-available', {});
                // Set timeout
                const timeoutId = setTimeout(() => {
                    console.log('Motion Canvas Cache server plugin not available (timeout)');
                    resolve(false);
                }, 500); // 0.5 second timeout
                // Listen for server availability response
                import.meta.hot.on('cache:available', () => {
                    console.log('Motion Canvas Cache server plugin is available');
                    clearTimeout(timeoutId);
                    resolve(true);
                });
            });
            // Listen for responses from the server
            import.meta.hot.on('cache:upload-success', (data) => {
                const { cacheKey, filePath, metadata } = data;
                if (cacheKey && filePath) {
                    const result = { url: filePath, metadata };
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
            import.meta.hot.on('cache:upload-error', (data) => {
                const { cacheKey, error } = data;
                console.error(`Server upload failed for ${cacheKey}:`, error);
                // Reject pending request if any
                const pending = this.pendingRequests.get(cacheKey);
                if (pending) {
                    pending.reject(new Error(error));
                    this.pendingRequests.delete(cacheKey);
                }
            });
            import.meta.hot.on('cache:file-exists', (data) => {
                const { cacheKey, filePath, metadata } = data;
                if (cacheKey && filePath) {
                    const result = { url: filePath, metadata };
                    this.cache.set(cacheKey, result);
                    console.log(`Found existing cached file for ${cacheKey} at ${filePath}`);
                    // Resolve pending request if any
                    const pending = this.pendingRequests.get(cacheKey);
                    if (pending) {
                        pending.resolve(result);
                        this.pendingRequests.delete(cacheKey);
                    }
                }
            });
            import.meta.hot.on('cache:file-not-found', (data) => {
                const { cacheKey } = data;
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
    get(cacheKey) {
        return this.cache.get(cacheKey) ?? null;
    }
    /**
     * Check if a cache key exists in memory cache (synchronous)
     *
     * @param cacheKey - The cache key to check
     * @returns true if the key exists in memory cache
     */
    has(cacheKey) {
        return this.cache.has(cacheKey);
    }
    set(cacheKey, result) {
        this.cache.set(cacheKey, result);
    }
    cacheResult(cacheKey, url, metadata) {
        this.set(cacheKey, { url, metadata });
    }
    /**
     * Cache a Blob with optional metadata and MIME type
     *
     * @param cacheKey - The cache key to store the blob under
     * @param blob - The Blob to cache
     * @param metadata - Optional metadata to store with the cached blob
     * @param mimeType - Optional MIME type override (uses blob.type if not provided)
     * @returns The blob URL that can be used to reference the cached blob
     */
    async cacheBlob(cacheKey, blob, metadata, mimeType) {
        const finalMimeType = mimeType || blob.type || 'application/octet-stream';
        // Create a blob URL for in-memory cache
        const blobUrl = URL.createObjectURL(blob);
        // Cache in memory
        this.cacheResult(cacheKey, blobUrl, metadata);
        // Convert blob to ArrayBuffer for upload
        const arrayBuffer = await blob.arrayBuffer();
        // Upload to server cache (async, non-blocking)
        this.uploadToServer(cacheKey, arrayBuffer, finalMimeType, metadata).catch(error => {
            console.warn('Failed to upload to server cache:', error);
        });
        return blobUrl;
    }
    async checkServerCache(cacheKey) {
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
            this.pendingRequests.set(cacheKey, { resolve, reject });
            // Send request via HMR
            import.meta.hot.send('cache:check-file', { cacheKey });
            // Timeout after one second
            setTimeout(() => {
                if (this.pendingRequests.has(cacheKey)) {
                    this.pendingRequests.delete(cacheKey);
                    resolve(null); // Treat timeout as not found
                }
            }, 1000);
        });
    }
    async uploadToServer(cacheKey, data, mimeType, metadata) {
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
        const blob = new Blob([data], { type: mimeType });
        const dataUrl = await CacheUtils.blobToDataUrl(blob);
        // Send via HMR
        import.meta.hot.send('cache:upload-file', {
            data: dataUrl,
            mimeType,
            cacheKey,
            metadata: metadata || {},
        });
    }
    streamToArrayBuffer(stream) {
        return CacheUtils.streamToArrayBuffer(stream);
    }
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
 * @example
 * // Cache with Request object
 * const request = new Request('https://api.tts.com/generate', {
 *   method: 'POST',
 *   body: JSON.stringify({text: 'Hello'}),
 * });
 * yield cache(request, {
 *   cacheKey: 'my-custom-key',
 *   metadata: { duration: 3.5 }
 * });
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
export async function cache(input, options = {}) {
    // Use the singleton cache instance
    const cacheInstance = Cache.getInstance();
    // Convert input to string for cache key generation
    let urlString;
    if (input instanceof Request) {
        urlString = input.url;
    }
    else if (input instanceof URL) {
        urlString = input.toString();
    }
    else {
        urlString = input;
    }
    // Warn if both cacheKey and cacheKeyOptions are provided
    if (options.cacheKey && options.cacheKeyOptions && options.cacheKeyOptions.length > 0) {
        console.warn('Both cacheKey and cacheKeyOptions were provided. cacheKeyOptions will be ignored.');
    }
    // Use provided cache key or generate from URL and options
    const cacheKey = options.cacheKey || CacheUtils.generateCacheKey(urlString, options.cacheKeyOptions || []);
    // Check in-memory cache first
    const cachedResult = cacheInstance.get(cacheKey);
    if (cachedResult) {
        console.log(`Found in memory cache for ${cacheKey}`);
        return cachedResult.url;
    }
    // Check server cache
    const serverResult = await cacheInstance.checkServerCache(cacheKey);
    if (serverResult) {
        console.log(`Found in server cache for ${cacheKey}`);
        return serverResult.url;
    }
    // Not in cache - fetch from URL
    console.log(`Fetching from URL: ${urlString}`);
    const response = await fetch(input, options.fetchOptions);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${urlString}: ${response.status} ${response.statusText}`);
    }
    // Auto-detect MIME type from response headers
    const contentType = response.headers.get('content-type');
    const mimeType = options.mimeType || contentType || 'application/octet-stream';
    const blob = await response.blob();
    // Convert blob to ArrayBuffer for upload
    const arrayBuffer = await blob.arrayBuffer();
    // Create a blob URL for in-memory cache
    const blobUrl = URL.createObjectURL(blob);
    // Cache in memory
    cacheInstance.cacheResult(cacheKey, blobUrl, options.metadata);
    // Upload to server cache (async, non-blocking)
    cacheInstance.uploadToServer(cacheKey, arrayBuffer, mimeType, options.metadata).catch(error => {
        console.warn('Failed to upload to server cache:', error);
    });
    return blobUrl;
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
export function cached(input, options = {}) {
    const cacheInstance = Cache.getInstance();
    // Convert input to string for cache key generation
    let urlString;
    if (input instanceof Request) {
        urlString = input.url;
    }
    else if (input instanceof URL) {
        urlString = input.toString();
    }
    else {
        urlString = input;
    }
    // Use provided cache key or generate from URL and options
    const cacheKey = options.cacheKey || CacheUtils.generateCacheKey(urlString, options.cacheKeyOptions || []);
    // Check in-memory cache only (synchronous)
    const cachedResult = cacheInstance.get(cacheKey);
    return cachedResult ? cachedResult.url : null;
}
//# sourceMappingURL=Cache.js.map