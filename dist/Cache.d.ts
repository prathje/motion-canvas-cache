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
export declare class Cache {
    private static instance;
    private cache;
    private pendingRequests;
    private serverAvailablePromise;
    private constructor();
    static getInstance(): Cache;
    private initializeHMR;
    get(cacheKey: CacheKey): CachedResult | null;
    /**
     * Check if a cache key exists in memory cache (synchronous)
     *
     * @param cacheKey - The cache key to check
     * @returns true if the key exists in memory cache
     */
    has(cacheKey: CacheKey): boolean;
    private set;
    cacheResult(cacheKey: CacheKey, url: string, metadata?: Record<string, any>): void;
    /**
     * Cache a Blob with optional metadata and MIME type
     *
     * @param cacheKey - The cache key to store the blob under
     * @param blob - The Blob to cache
     * @param metadata - Optional metadata to store with the cached blob
     * @param mimeType - Optional MIME type override (uses blob.type if not provided)
     * @returns The blob URL that can be used to reference the cached blob
     */
    cacheBlob(cacheKey: CacheKey, blob: Blob, metadata?: Record<string, any>, mimeType?: string): Promise<string>;
    checkServerCache(cacheKey: CacheKey): Promise<CachedResult | null>;
    uploadToServer(cacheKey: CacheKey, data: ArrayBuffer, mimeType: string, metadata?: Record<string, any>): Promise<void>;
    streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer>;
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
export declare function cache(input: string | URL | Request, options?: CachedOptions): Promise<string>;
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
export declare function cached(input: string | URL | Request, options?: CachedOptions): string | null;
export {};
//# sourceMappingURL=Cache.d.ts.map