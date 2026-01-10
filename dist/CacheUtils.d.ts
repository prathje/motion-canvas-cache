export declare class CacheUtils {
    /**
     * Generates a cache key from content and options
     */
    static generateCacheKey(content: string, opts?: string[]): string;
    /**
     * Simple hash function for generating cache keys
     * Always returns exactly 8 hexadecimal characters
     */
    private static simpleHash;
    /**
     * Converts a Blob to a data URL (base64 encoded)
     */
    static blobToDataUrl(blob: Blob): Promise<string>;
    /**
     * Converts a ReadableStream to ArrayBuffer
     */
    static streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer>;
}
//# sourceMappingURL=CacheUtils.d.ts.map