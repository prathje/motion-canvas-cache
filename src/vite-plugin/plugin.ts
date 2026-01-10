import fs from 'fs';
import path from 'path';
import {Plugin, ViteDevServer} from 'vite';

export interface MotionCanvasCachePluginOptions {
  cachePath?: string;
  maxFileSize?: number; // in MB
}

export function motionCanvasCachePlugin(
  options: MotionCanvasCachePluginOptions = {},
): Plugin {
  const {
    cachePath = 'motion-canvas-cache',
    maxFileSize = 50, // 50MB default
  } = options;

  return {
    name: 'motion-canvas-cache:file-storage',
    configureServer(server: ViteDevServer) {
      // Ensure cache directory exists
      if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, {recursive: true});
      }

      // WebSocket handler for file uploads
      server.ws.on(
        'cache:upload-file',
        async (message: any, client: any) => {
          try {
            const {data, mimeType, cacheKey, metadata} = message;

            // Validate file size
            const base64Data = data.slice(data.indexOf(',') + 1);
            const bufferData = Buffer.from(base64Data, 'base64');
            const fileSizeMB = bufferData.length / (1024 * 1024);

            if (fileSizeMB > maxFileSize) {
              client.send('cache:upload-error', {
                error: `File too large: ${fileSizeMB.toFixed(
                  2,
                )}MB (max: ${maxFileSize}MB)`,
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

            await fs.promises.writeFile(
              metadataPath,
              JSON.stringify(metadataContent, null, 2),
            );

            // Send success response
            client.send('cache:upload-success', {
              cacheKey,
              filePath: '/' + filePath,
              metadata: metadataContent,
              size: bufferData.length,
            });

            console.log(
              `File cached: ${filePath} (${fileSizeMB.toFixed(2)}MB)`,
            );
          } catch (error) {
            console.error('File upload error:', error);
            client.send('cache:upload-error', {
              error: error instanceof Error ? error.message : 'Unknown error',
              cacheKey: message.cacheKey,
            });
          }
        },
      );

      // WebSocket handler for checking if plugin is available
      server.ws.on('cache:check-available', (message: any, client: any) => {
        client.send('cache:available', {});
      });

      // WebSocket handler for checking if file exists
      server.ws.on(
        'cache:check-file',
        async (message: any, client: any) => {
          try {
            const {cacheKey} = message;
            const metadataPath = path.join(cachePath, `${cacheKey}.meta.json`);

            // First check if metadata exists
            if (fs.existsSync(metadataPath)) {
              const metadata = JSON.parse(
                await fs.promises.readFile(metadataPath, 'utf8'),
              );

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
            client.send('cache:file-not-found', {cacheKey});
          } catch (error) {
            console.error('File check error:', error);
            client.send('cache:file-not-found', {
              cacheKey: message.cacheKey,
            });
          }
        },
      );

      // Optional cleanup endpoint
      server.middlewares.use('/__cache-cleanup', async (req, res) => {
        try {
          if (!fs.existsSync(cachePath)) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({message: 'Cache directory does not exist'}));
            return;
          }

          const files = await fs.promises.readdir(cachePath);
          for (const file of files) {
            await fs.promises.unlink(path.join(cachePath, file));
          }

          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              message: 'Cache cleared',
              filesDeleted: files.length,
            }),
          );
        } catch (error) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          );
        }
      });
    },
  };
}

function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
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

function writeFile(filePath: string, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createWriteStream(filePath)
      .on('finish', resolve)
      .on('error', reject)
      .end(buffer);
  });
}
