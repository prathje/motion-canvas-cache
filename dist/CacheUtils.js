export class CacheUtils {
    /**
     * Generates a cache key from content and options
     */
    static generateCacheKey(content, opts = []) {
        const combinedContent = `${content}-${opts.join('-')}`;
        return CacheUtils.simpleHash(combinedContent);
    }
    /**
     * Simple hash function for generating cache keys
     * Always returns exactly 8 hexadecimal characters
     */
    static simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Convert to hex and ensure exactly 8 characters by padding with zeros or truncating
        return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
    }
    /**
     * Converts a Blob to a data URL (base64 encoded)
     */
    static blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    /**
     * Converts a ReadableStream to ArrayBuffer
     */
    static async streamToArrayBuffer(stream) {
        const reader = stream.getReader();
        const chunks = [];
        let totalLength = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
                totalLength += value.length;
            }
        }
        finally {
            reader.releaseLock();
        }
        // Combine all chunks into a single ArrayBuffer
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result.buffer;
    }
}
//# sourceMappingURL=CacheUtils.js.map