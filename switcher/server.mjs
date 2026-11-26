import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAllReleases, DIST_DIR } from './build.mjs';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3000;

export const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
});

export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export function parsePort(rawPort, fallback = DEFAULT_PORT) {
  if (rawPort === undefined || rawPort === null || rawPort === '') {
    return fallback;
  }

  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value "${rawPort}". Expected an integer between 0 and 65535.`);
  }
  return parsed;
}

export function resolveSafePath(rootDir, urlPathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPathname);
  } catch {
    return { status: 'bad_request' };
  }

  if (decodedPath.includes('\0')) {
    return { status: 'bad_request' };
  }

  const normalizedRoot = path.resolve(rootDir);
  const relativeSegments = decodedPath.replace(/^\/+/, '');
  const candidatePath = path.resolve(normalizedRoot, relativeSegments);
  const relativeFromRoot = path.relative(normalizedRoot, candidatePath);

  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    return { status: 'forbidden' };
  }

  return {
    status: 'ok',
    filePath: candidatePath,
    hasTrailingSlash: decodedPath.endsWith('/'),
  };
}

export function isBuildReady(distDir = DIST_DIR) {
  return (
    fs.existsSync(path.join(distDir, 'index.html')) &&
    fs.existsSync(path.join(distDir, 'releases.json'))
  );
}

export function createStaticServer({ distDir = DIST_DIR } = {}) {
  const resolvedDistDir = path.resolve(distDir);

  return http.createServer((req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        Allow: 'GET, HEAD',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Method Not Allowed\n');
      return;
    }

    const rawUrl = req.url || '/';
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    } catch {
      res.writeHead(400, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Bad Request\n');
      return;
    }

    const rawPathname = rawUrl.split(/[?#]/, 1)[0] || '/';
    const resolved = resolveSafePath(resolvedDistDir, rawPathname);
    if (resolved.status === 'bad_request' || resolved.status === 'forbidden') {
      const code = resolved.status === 'forbidden' ? 403 : 400;
      res.writeHead(code, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end(`${code === 403 ? 'Forbidden' : 'Bad Request'}\n`);
      return;
    }

    let targetPath = resolved.filePath;
    let stats;
    try {
      stats = fs.statSync(targetPath);
    } catch {
      res.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Not Found\n');
      return;
    }

    if (stats.isDirectory()) {
      if (!resolved.hasTrailingSlash && parsedUrl.pathname !== '/') {
        res.writeHead(301, {
          Location: `${parsedUrl.pathname}/${parsedUrl.search}`,
          'Cache-Control': 'no-store',
        });
        res.end();
        return;
      }

      targetPath = path.join(targetPath, 'index.html');
      try {
        stats = fs.statSync(targetPath);
      } catch {
        res.writeHead(404, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end('Not Found\n');
        return;
      }
    }

    if (!stats.isFile()) {
      res.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('Not Found\n');
      return;
    }

    res.writeHead(200, {
      'Content-Type': getMimeType(targetPath),
      'Content-Length': stats.size,
      'Cache-Control': 'no-store',
    });

    if (method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(targetPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        });
      }
      res.end('Internal Server Error\n');
    });
    stream.pipe(res);
  });
}

export async function startServer({
  distDir = DIST_DIR,
  host = DEFAULT_HOST,
  port = parsePort(process.env.PORT, DEFAULT_PORT),
  autoBuild = true,
  buildFn = buildAllReleases,
} = {}) {
  if (autoBuild && !isBuildReady(distDir)) {
    buildFn({ distDir });
  }

  const server = createStaticServer({ distDir });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      if (error && error.code === 'EADDRINUSE') {
        const busyError = new Error(
          `Port ${port} on ${host} is already in use (EADDRINUSE). ` +
            'Stop the existing process or start with a different PORT=<port>.'
        );
        busyError.code = 'EADDRINUSE';
        reject(busyError);
        return;
      }
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    host,
    port: listeningPort,
    url: `http://localhost:${listeningPort}`,
    boundUrl: `http://${host}:${listeningPort}`,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startServer()
    .then(({ server, url, boundUrl }) => {
      console.log(`[switcher] Ready at ${url} (listening on ${boundUrl})`);

      const shutdown = () => {
        server.close(() => process.exit(0));
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error(`[switcher] ${error.message}`);
      process.exit(1);
    });
}
