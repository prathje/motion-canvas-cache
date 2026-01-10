import {describe, it, expect} from 'vitest';
import {CacheUtils} from '../src/CacheUtils';

describe('CacheUtils', () => {
  describe('generateCacheKey', () => {
    it('should generate an 8-character hex cache key', () => {
      const key = CacheUtils.generateCacheKey('test-content');
      expect(key).toMatch(/^[0-9a-f]{8}$/);
      expect(key.length).toBe(8);
    });

    it('should generate consistent keys for same input', () => {
      const key1 = CacheUtils.generateCacheKey('test-content');
      const key2 = CacheUtils.generateCacheKey('test-content');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = CacheUtils.generateCacheKey('content-1');
      const key2 = CacheUtils.generateCacheKey('content-2');
      expect(key1).not.toBe(key2);
    });

    it('should include options in key generation', () => {
      const key1 = CacheUtils.generateCacheKey('test', ['option1']);
      const key2 = CacheUtils.generateCacheKey('test', ['option2']);
      expect(key1).not.toBe(key2);
    });

    it('should handle empty options array', () => {
      const key = CacheUtils.generateCacheKey('test', []);
      expect(key).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('blobToDataUrl', () => {
    it('should convert blob to base64 data URL', async () => {
      const blob = new Blob(['test content'], {type: 'text/plain'});
      const dataUrl = await CacheUtils.blobToDataUrl(blob);

      expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
      expect(dataUrl.length).toBeGreaterThan(30);
    });

    it('should preserve MIME type in data URL', async () => {
      const blob = new Blob(['{"key": "value"}'], {type: 'application/json'});
      const dataUrl = await CacheUtils.blobToDataUrl(blob);

      expect(dataUrl).toMatch(/^data:application\/json;base64,/);
    });

    it('should handle empty blob', async () => {
      const blob = new Blob([], {type: 'text/plain'});
      const dataUrl = await CacheUtils.blobToDataUrl(blob);

      expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
    });
  });

  describe('streamToArrayBuffer', () => {
    it('should convert ReadableStream to ArrayBuffer', async () => {
      const data = new TextEncoder().encode('test content');
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      const buffer = await CacheUtils.streamToArrayBuffer(stream);
      const decoded = new TextDecoder().decode(buffer);

      expect(decoded).toBe('test content');
    });

    it('should handle empty stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const buffer = await CacheUtils.streamToArrayBuffer(stream);
      expect(buffer.byteLength).toBe(0);
    });

    it('should handle chunked data', async () => {
      const chunk1 = new TextEncoder().encode('Hello ');
      const chunk2 = new TextEncoder().encode('World');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      const buffer = await CacheUtils.streamToArrayBuffer(stream);
      const decoded = new TextDecoder().decode(buffer);

      expect(decoded).toBe('Hello World');
    });
  });
});
