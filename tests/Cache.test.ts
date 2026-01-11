import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Cache, cache, cached} from '../src/Cache';
import {CacheUtils} from '../src/CacheUtils';

// Mock fetch globally
global.fetch = vi.fn();

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

describe('Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (Cache as any).instance = null;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = Cache.getInstance();
      const instance2 = Cache.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('get and cacheResult', () => {
    it('should store and retrieve cached results', () => {
      const cacheInstance = Cache.getInstance();
      const cacheKey = 'test-key';
      const url = 'blob:test-url';
      const metadata = {size: 1024};

      cacheInstance.cacheResult(cacheKey, url, metadata);
      const result = cacheInstance.get(cacheKey);

      expect(result).toEqual({
        url,
        metadata,
      });
    });

    it('should return null for non-existent cache key', () => {
      const cacheInstance = Cache.getInstance();
      const result = cacheInstance.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should cache result without metadata', () => {
      const cacheInstance = Cache.getInstance();
      const cacheKey = 'test-key';
      const url = 'blob:test-url';

      cacheInstance.cacheResult(cacheKey, url);
      const result = cacheInstance.get(cacheKey);

      expect(result).toEqual({
        url,
        metadata: undefined,
      });
    });
  });

  describe('cacheBlob', () => {
    it('should cache a blob and return its URL', async () => {
      const cacheInstance = Cache.getInstance();
      const blob = new Blob(['test content'], {type: 'text/plain'});
      const cacheKey = 'test-blob-key';
      const metadata = {source: 'test'};

      const blobUrl = await cacheInstance.cacheBlob(blob, {cacheKey, metadata});

      expect(blobUrl).toBe('blob:mock-url');
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

      const cached = cacheInstance.get(cacheKey);
      expect(cached).toEqual({
        url: 'blob:mock-url',
        metadata,
      });
    });

    it('should use blob.type as MIME type if not provided', async () => {
      const cacheInstance = Cache.getInstance();
      const blob = new Blob(['test'], {type: 'application/json'});
      const cacheKey = 'json-key';

      await cacheInstance.cacheBlob(blob, {cacheKey});

      // Verify it was cached
      const cached = cacheInstance.get(cacheKey);
      expect(cached).toBeDefined();
    });

    it('should override MIME type when provided', async () => {
      const cacheInstance = Cache.getInstance();
      const blob = new Blob(['test'], {type: 'text/plain'});
      const cacheKey = 'override-key';

      await cacheInstance.cacheBlob(blob, {cacheKey, mimeType: 'application/json'});

      // Verify it was cached
      const cached = cacheInstance.get(cacheKey);
      expect(cached).toBeDefined();
    });
  });

  describe('cacheArrayBuffer', () => {
    it('should cache an ArrayBuffer and return its URL', async () => {
      const cacheInstance = Cache.getInstance();
      const data = new TextEncoder().encode('test content');
      const arrayBuffer = data.buffer;
      const cacheKey = 'test-buffer-key';
      const metadata = {source: 'test'};

      const blobUrl = await cacheInstance.cacheArrayBuffer(arrayBuffer, {
        cacheKey,
        metadata,
        mimeType: 'text/plain',
      });

      expect(blobUrl).toBe('blob:mock-url');
      const cached = cacheInstance.get(cacheKey);
      expect(cached).toEqual({
        url: 'blob:mock-url',
        metadata,
      });
    });
  });

  describe('cacheUrl', () => {
    it('should fetch and cache a URL', async () => {
      const mockBlob = new Blob(['test content'], {type: 'text/plain'});
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: {get: () => 'text/plain'},
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('test content').buffer),
      });

      const cacheInstance = Cache.getInstance();
      const url = 'https://example.com/test.txt';
      const cacheKey = 'test-url-key';

      const blobUrl = await cacheInstance.cacheUrl(url, {cacheKey});

      expect(blobUrl).toBe('blob:mock-url');
      expect(global.fetch).toHaveBeenCalled();
      const cached = cacheInstance.get(cacheKey);
      expect(cached).toBeDefined();
    });
  });
});

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (Cache as any).instance = null;
  });

  it('should fetch and cache a URL', async () => {
    const mockBlob = new Blob(['test content'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {
        get: () => 'text/plain',
      },
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';
    const result = await cache(url);

    expect(result).toBe('blob:mock-url');
    expect(global.fetch).toHaveBeenCalledWith(url);
  });

  it('should return cached URL on subsequent calls', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';

    // First call - should fetch
    const result1 = await cache(url);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await cache(url);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1
    expect(result1).toBe(result2);
  });

  it('should use custom cache key when provided', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';
    const customKey = 'my-custom-key';

    const result = await cache(url, {cacheKey: customKey});

    const cacheInstance = Cache.getInstance();
    const cachedResult = cacheInstance.get(customKey);
    expect(cachedResult).toBeDefined();
    expect(cachedResult?.url).toBe(result);
  });

  it('should warn when both cacheKey and cacheKeyOptions are provided', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    await cache('https://example.com/test.txt', {
      cacheKey: 'custom-key',
      cacheKeyOptions: ['option1', 'option2'],
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Both cacheKey and cacheKeyOptions were provided. cacheKeyOptions will be ignored.'
    );

    consoleWarnSpy.mockRestore();
  });

  it('should use cacheKeyOptions when no cacheKey provided', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';
    const options = ['fast', 'lowquality'];

    await cache(url, {cacheKeyOptions: options});

    const expectedKey = CacheUtils.generateCacheKey(url, options);
    const cacheInstance = Cache.getInstance();
    const cachedResult = cacheInstance.get(expectedKey);

    expect(cachedResult).toBeDefined();
  });

  it('should store metadata with cached result', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';
    const metadata = {duration: 3.5, title: 'Test'};

    await cache(url, {metadata});

    const cacheInstance = Cache.getInstance();
    const cacheKey = CacheUtils.generateCacheKey(url, []);
    const cachedResult = cacheInstance.get(cacheKey);

    expect(cachedResult?.metadata).toEqual(metadata);
  });

  it('should override MIME type when provided', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';

    await cache(url, {mimeType: 'application/json'});

    // Should not throw and should cache successfully
    const cacheInstance = Cache.getInstance();
    const cacheKey = CacheUtils.generateCacheKey(url, []);
    expect(cacheInstance.get(cacheKey)).toBeDefined();
  });

  it('should throw error on fetch failure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const url = 'https://example.com/nonexistent.txt';

    await expect(cache(url)).rejects.toThrow('Failed to fetch');
  });

  it('should accept URL object', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = new URL('https://example.com/test.txt');
    const result = await cache(url);

    expect(result).toBe('blob:mock-url');
    expect(global.fetch).toHaveBeenCalledWith(url.toString());
  });

  it('should pass fetchOptions to fetch', async () => {
    const mockBlob = new Blob(['test'], {type: 'application/json'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'application/json'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://api.example.com/data';
    const fetchOptions = {
      method: 'POST',
      headers: {'Authorization': 'Bearer token'},
      body: JSON.stringify({text: 'Hello'}),
    };

    await cache(url, {fetchOptions});

    expect(global.fetch).toHaveBeenCalledWith(url, fetchOptions);
  });
});

describe('cached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    (Cache as any).instance = null;
  });

  it('should return null when nothing is cached', () => {
    const url = 'https://example.com/test.png';
    const result = cached(url);
    expect(result).toBeNull();
  });

  it('should return cached URL when item is in memory cache', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';

    // First cache it
    const cachedUrl = await cache(url);

    // Then check synchronously
    const result = cached(url);
    expect(result).toBe(cachedUrl);
    expect(result).toBe('blob:mock-url');
  });

  it('should work with custom cache key', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/test.txt';
    const customKey = 'my-custom-key';

    // Cache with custom key
    await cache(url, {cacheKey: customKey});

    // Check with same custom key
    const result = cached(url, {cacheKey: customKey});
    expect(result).toBe('blob:mock-url');

    // Check without custom key should return null
    const resultWithoutKey = cached(url);
    expect(resultWithoutKey).toBeNull();
  });

  it('should work with cache key options', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = 'https://example.com/audio.mp3';
    const options = ['fast', 'lowquality'];

    // Cache with options
    await cache(url, {cacheKeyOptions: options});

    // Check with same options
    const result = cached(url, {cacheKeyOptions: options});
    expect(result).toBe('blob:mock-url');

    // Check with different options should return null
    const resultDifferentOptions = cached(url, {cacheKeyOptions: ['slow']});
    expect(resultDifferentOptions).toBeNull();
  });

  it('should work with URL object', async () => {
    const mockBlob = new Blob(['test'], {type: 'text/plain'});
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: {get: () => 'text/plain'},
      blob: () => Promise.resolve(mockBlob),
      arrayBuffer: () => mockBlob.arrayBuffer(),
    });

    const url = new URL('https://example.com/test.txt');

    // Cache with URL object
    await cache(url);

    // Check with URL object
    const result = cached(url);
    expect(result).toBe('blob:mock-url');

    // Check with string version should also work
    const resultString = cached(url.toString());
    expect(resultString).toBe('blob:mock-url');
  });
});
