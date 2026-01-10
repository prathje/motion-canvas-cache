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
 * Convenience method to cache a file from a URL
 *
 * @param input - URL to fetch (string, URL object, or Request object)
 * @param options - Optional configuration
 *   - metadata: Custom metadata to store with the cached file
 *   - mimeType: Override MIME type (auto-detected if not provided)
 *   - cacheKeyOptions: Additional options for cache key generation
 *   - cacheKey: Override the automatically generated cache key
 *   - fetchOptions: Additional options to pass to fetch()
 * @returns Promise<string> - The cached URL (blob URL or server path)
 *
 * @example
 * // Cache an image from a URL string
 * const imageUrl = await cached('https://example.com/image.png', {
 *   metadata: { width: 800, height: 600 },
 *   mimeType: 'image/png'
 * });
 *
 * @example
 * // Cache with URL object
 * const url = new URL('https://example.com/image.png');
 * const imageUrl = await cached(url);
 *
 * @example
 * // Cache with Request object
 * const request = new Request('https://api.tts.com/generate', {
 *   method: 'POST',
 *   body: JSON.stringify({text: 'Hello'}),
 * });
 * const audioUrl = await cached(request, {
 *   cacheKey: 'my-custom-key',
 *   metadata: { duration: 3.5 }
 * });
 *
 * @example
 * // Cache with fetch options
 * const audioUrl = await cached('https://api.tts.com/generate', {
 *   fetchOptions: {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({text: 'Hello'}),
 *   },
 *   metadata: { duration: 3.5 }
 * });
 *
 * // Use in Motion Canvas
 * view.add(<Img src={imageUrl} />);
 */
export declare function cached(input: string | URL | Request, options?: CachedOptions): Promise<string>;
export {};
//# sourceMappingURL=Cache.d.ts.map