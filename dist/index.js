import fs from 'fs';
import path from 'path';

class CacheUtils {
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

class Cache {
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
async function cached(input, options = {}) {
    // Use the singleton cache instance
    const cache = Cache.getInstance();
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
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        console.log(`Found in memory cache for ${cacheKey}`);
        return cachedResult.url;
    }
    // Check server cache
    const serverResult = await cache.checkServerCache(cacheKey);
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
    cache.cacheResult(cacheKey, blobUrl, options.metadata);
    // Upload to server cache (async, non-blocking)
    cache.uploadToServer(cacheKey, arrayBuffer, mimeType, options.metadata).catch(error => {
        console.warn('Failed to upload to server cache:', error);
    });
    return blobUrl;
}

function motionCanvasCachePlugin(options = {}) {
    const { cachePath = 'motion-canvas-cache', maxFileSize = 50, // 50MB default
     } = options;
    return {
        name: 'motion-canvas-cache:file-storage',
        configureServer(server) {
            // Ensure cache directory exists
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }
            // WebSocket handler for file uploads
            server.ws.on('cache:upload-file', async (message, client) => {
                try {
                    const { data, mimeType, cacheKey, metadata } = message;
                    // Validate file size
                    const base64Data = data.slice(data.indexOf(',') + 1);
                    const bufferData = Buffer.from(base64Data, 'base64');
                    const fileSizeMB = bufferData.length / (1024 * 1024);
                    if (fileSizeMB > maxFileSize) {
                        client.send('cache:upload-error', {
                            error: `File too large: ${fileSizeMB.toFixed(2)}MB (max: ${maxFileSize}MB)`,
                            cacheKey,
                        });
                        return;
                    }
                    // Generate file extension from mime type
                    const extension = getExtensionFromMimeType(mimeType);
                    // Create file path using cache key as filename
                    const fileName = `${cacheKey}.${extension}`;
                    const filePath = path.join(cachePath, fileName);
                    // Write file
                    await writeFile(filePath, bufferData);
                    // Create metadata file
                    const metadataPath = path.join(cachePath, `${cacheKey}.meta.json`);
                    const metadataContent = {
                        cacheKey,
                        mimeType,
                        fileSize: bufferData.length,
                        fileName,
                        createdAt: new Date().toISOString(),
                        ...metadata,
                    };
                    await fs.promises.writeFile(metadataPath, JSON.stringify(metadataContent, null, 2));
                    // Send success response
                    client.send('cache:upload-success', {
                        cacheKey,
                        filePath: '/' + filePath,
                        metadata: metadataContent,
                        size: bufferData.length,
                    });
                    console.log(`File cached: ${filePath} (${fileSizeMB.toFixed(2)}MB)`);
                }
                catch (error) {
                    console.error('File upload error:', error);
                    client.send('cache:upload-error', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        cacheKey: message.cacheKey,
                    });
                }
            });
            // WebSocket handler for checking if plugin is available
            server.ws.on('cache:check-available', (message, client) => {
                client.send('cache:available', {});
            });
            // WebSocket handler for checking if file exists
            server.ws.on('cache:check-file', async (message, client) => {
                try {
                    const { cacheKey } = message;
                    const metadataPath = path.join(cachePath, `${cacheKey}.meta.json`);
                    // First check if metadata exists
                    if (fs.existsSync(metadataPath)) {
                        const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
                        // Then check if the actual file exists
                        const fileName = metadata.fileName || `${cacheKey}.bin`;
                        const filePath = path.join(cachePath, fileName);
                        if (fs.existsSync(filePath)) {
                            client.send('cache:file-exists', {
                                cacheKey,
                                filePath: '/' + filePath,
                                metadata,
                            });
                            return;
                        }
                    }
                    // File not found
                    client.send('cache:file-not-found', { cacheKey });
                }
                catch (error) {
                    console.error('File check error:', error);
                    client.send('cache:file-not-found', {
                        cacheKey: message.cacheKey,
                    });
                }
            });
            // Optional cleanup endpoint
            server.middlewares.use('/__cache-cleanup', async (req, res) => {
                try {
                    if (!fs.existsSync(cachePath)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ message: 'Cache directory does not exist' }));
                        return;
                    }
                    const files = await fs.promises.readdir(cachePath);
                    for (const file of files) {
                        await fs.promises.unlink(path.join(cachePath, file));
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: 'Cache cleared',
                        filesDeleted: files.length,
                    }));
                }
                catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: error instanceof Error ? error.message : 'Unknown error',
                    }));
                }
            });
        },
    };
}
function getExtensionFromMimeType(mimeType) {
    const extensions = {
        // Audio
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/webm': 'webm',
        // Video
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/ogg': 'ogv',
        // Images
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/svg+xml': 'svg',
        'image/webp': 'webp',
        // Documents
        'application/pdf': 'pdf',
        'application/json': 'json',
        'text/plain': 'txt',
        'text/html': 'html',
        'text/css': 'css',
        'application/javascript': 'js',
    };
    return extensions[mimeType] || 'bin';
}
function writeFile(filePath, buffer) {
    return new Promise((resolve, reject) => {
        fs.createWriteStream(filePath)
            .on('finish', resolve)
            .on('error', reject)
            .end(buffer);
    });
}

export { Cache, CacheUtils, cached, motionCanvasCachePlugin };
//# sourceMappingURL=index.js.map
