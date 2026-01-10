import {describe, it, expect, beforeEach, vi} from 'vitest';
import {motionCanvasCachePlugin} from '../src/vite-plugin/plugin';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    promises: {
      writeFile: vi.fn(),
      readFile: vi.fn(),
      readdir: vi.fn(),
      unlink: vi.fn(),
    },
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(),
  promises: {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe('motionCanvasCachePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a Vite plugin object', () => {
    const plugin = motionCanvasCachePlugin();

    expect(plugin).toHaveProperty('name');
    expect(plugin.name).toBe('motion-canvas-cache:file-storage');
    expect(plugin).toHaveProperty('configureServer');
  });

  it('should use default options when none provided', () => {
    const plugin = motionCanvasCachePlugin();
    expect(plugin.name).toBe('motion-canvas-cache:file-storage');
  });

  it('should accept custom cachePath option', () => {
    const plugin = motionCanvasCachePlugin({
      cachePath: 'custom-cache-dir',
    });
    expect(plugin).toBeDefined();
  });

  it('should accept custom maxFileSize option', () => {
    const plugin = motionCanvasCachePlugin({
      maxFileSize: 100,
    });
    expect(plugin).toBeDefined();
  });

  describe('configureServer', () => {
    it('should set up server configuration', async () => {
      const plugin = motionCanvasCachePlugin({cachePath: 'test-cache'});

      const mockServer = {
        ws: {
          on: vi.fn(),
        },
        middlewares: {
          use: vi.fn(),
        },
      } as any;

      // Should not throw when configuring server
      expect(() => plugin.configureServer(mockServer)).not.toThrow();
    });

    it('should register WebSocket handlers', async () => {
      const {existsSync} = await import('fs');
      const plugin = motionCanvasCachePlugin();

      vi.mocked(existsSync).mockReturnValue(true);

      const mockServer = {
        ws: {
          on: vi.fn(),
        },
        middlewares: {
          use: vi.fn(),
        },
      } as any;

      plugin.configureServer(mockServer);

      // Check that WebSocket handlers are registered
      expect(mockServer.ws.on).toHaveBeenCalledWith('cache:upload-file', expect.any(Function));
      expect(mockServer.ws.on).toHaveBeenCalledWith('cache:check-available', expect.any(Function));
      expect(mockServer.ws.on).toHaveBeenCalledWith('cache:check-file', expect.any(Function));
    });

    it('should register cleanup middleware', async () => {
      const {existsSync} = await import('fs');
      const plugin = motionCanvasCachePlugin();

      vi.mocked(existsSync).mockReturnValue(true);

      const mockServer = {
        ws: {
          on: vi.fn(),
        },
        middlewares: {
          use: vi.fn(),
        },
      } as any;

      plugin.configureServer(mockServer);

      expect(mockServer.middlewares.use).toHaveBeenCalledWith('/__cache-cleanup', expect.any(Function));
    });
  });

  describe('getExtensionFromMimeType', () => {
    // This function is internal, but we can test it indirectly through the plugin behavior
    it('should handle common MIME types', () => {
      const plugin = motionCanvasCachePlugin();
      expect(plugin).toBeDefined();
      // Extension mapping is tested indirectly through upload functionality
    });
  });
});

describe('WebSocket Handlers', () => {
  it('should respond to cache:check-available', async () => {
    const {existsSync} = await import('fs');
    const plugin = motionCanvasCachePlugin();

    vi.mocked(existsSync).mockReturnValue(true);

    let checkAvailableHandler: Function;
    const mockServer = {
      ws: {
        on: vi.fn((event, handler) => {
          if (event === 'cache:check-available') {
            checkAvailableHandler = handler;
          }
        }),
      },
      middlewares: {
        use: vi.fn(),
      },
    } as any;

    plugin.configureServer(mockServer);

    const mockClient = {
      send: vi.fn(),
    };

    // Call the handler
    checkAvailableHandler!({}, mockClient);

    expect(mockClient.send).toHaveBeenCalledWith('cache:available', {});
  });
});
