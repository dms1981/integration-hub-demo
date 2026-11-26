import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createManifest } from '../build.mjs';
import {
  getMimeType,
  parsePort,
  resolveSafePath,
  startServer,
} from '../server.mjs';

const activeServers = [];
const tempDirs = [];

function makeTempDist(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'switcher-test-'));
  tempDirs.push(dir);

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  return dir;
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

function rawRequest({ port, method = 'GET', requestPath = '/' }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: requestPath,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await closeServer(server);
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('createManifest', () => {
  it('builds a valid manifest with defaultRelease, commit metadata, and entry paths for all three releases', () => {
    const manifest = createManifest(
      [
        {
          id: 'opus-5.5-high',
          tag: 'opus-5.5-high',
          label: 'Cascade',
          commit: '1234567890abcdef1234567890abcdef12345678',
        },
        {
          id: '6.2-Sol-High',
          tag: '6.2-Sol-High',
          label: 'Aftermatter',
          commit: 'abcdef1234567890abcdef1234567890abcdef12',
        },
        {
          id: 'gemini-4-neon-high',
          tag: 'gemini-4-neon-high',
          label: 'Solaris',
          commit: '55b724ea292dee2648d3ce54b6ad7901c16d25db',
        },
      ],
      '2026-11-26T00:00:00.000Z'
    );

    assert.equal(manifest.defaultRelease, 'opus-5.5-high');
    assert.equal(manifest.generatedAt, '2026-11-26T00:00:00.000Z');
    assert.equal(manifest.releases.length, 3);
    assert.deepEqual(manifest.releases[0], {
      id: 'opus-5.5-high',
      tag: 'opus-5.5-high',
      label: 'Cascade',
      commit: '1234567890abcdef1234567890abcdef12345678',
      shortCommit: '1234567',
      entry: './releases/opus-5.5-high/index.html',
    });
    assert.equal(manifest.releases[1].entry, './releases/6.2-Sol-High/index.html');
    assert.equal(manifest.releases[1].shortCommit, 'abcdef1');
    assert.deepEqual(manifest.releases[2], {
      id: 'gemini-4-neon-high',
      tag: 'gemini-4-neon-high',
      label: 'Solaris',
      commit: '55b724ea292dee2648d3ce54b6ad7901c16d25db',
      shortCommit: '55b724e',
      entry: './releases/gemini-4-neon-high/index.html',
    });
  });

  it('rejects an empty release list', () => {
    assert.throws(() => createManifest([]), /At least one release/);
  });
});

describe('resolveSafePath & MIME helpers', () => {
  it('maps common asset extensions to expected Content-Type values', () => {
    assert.equal(getMimeType('index.html'), 'text/html; charset=utf-8');
    assert.equal(getMimeType('bundle.js'), 'application/javascript; charset=utf-8');
    assert.equal(getMimeType('module.mjs'), 'application/javascript; charset=utf-8');
    assert.equal(getMimeType('styles.css'), 'text/css; charset=utf-8');
    assert.equal(getMimeType('releases.json'), 'application/json; charset=utf-8');
    assert.equal(getMimeType('shader.wasm'), 'application/wasm');
    assert.equal(getMimeType('unknown.bin'), 'application/octet-stream');
  });

  it('blocks traversal, malformed encoding, and null bytes', () => {
    const root = '/tmp/switcher-root';
    assert.equal(resolveSafePath(root, '/../secret.txt').status, 'forbidden');
    assert.equal(resolveSafePath(root, '/%2e%2e/secret.txt').status, 'forbidden');
    assert.equal(resolveSafePath(root, '/releases/../../etc/passwd').status, 'forbidden');
    assert.equal(resolveSafePath(root, '/%E0%A4%A').status, 'bad_request');
    assert.equal(resolveSafePath(root, '/index.html%00.js').status, 'bad_request');

    const ok = resolveSafePath(root, '/releases/opus-5.5-high/index.html');
    assert.equal(ok.status, 'ok');
    assert.equal(ok.filePath, path.resolve(root, 'releases/opus-5.5-high/index.html'));
  });

  it('validates PORT values cleanly', () => {
    assert.equal(parsePort(undefined, 3000), 3000);
    assert.equal(parsePort('4123', 3000), 4123);
    assert.throws(() => parsePort('abc'), /Invalid PORT/);
    assert.throws(() => parsePort('70000'), /Invalid PORT/);
  });
});

describe('HTTP static server', () => {
  it('serves /, /releases.json, and release assets with proper MIME types and Cache-Control: no-store', async () => {
    const distDir = makeTempDist({
      'index.html': '<!doctype html><h1>Switcher</h1>',
      'releases.json': JSON.stringify({ defaultRelease: 'opus-5.5-high', releases: [] }),
      'releases/opus-5.5-high/index.html': '<!doctype html><script type="module" src="./assets/app.js"></script>',
      'releases/opus-5.5-high/assets/app.js': 'console.log("cascade");',
      'releases/opus-5.5-high/assets/app.css': 'body { margin: 0; }',
    });

    const instance = await startServer({ distDir, port: 0, autoBuild: false });
    activeServers.push(instance.server);

    const rootRes = await rawRequest({ port: instance.port, requestPath: '/' });
    assert.equal(rootRes.statusCode, 200);
    assert.equal(rootRes.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(rootRes.headers['cache-control'], 'no-store');
    assert.match(rootRes.body, /Switcher/);

    const manifestRes = await rawRequest({ port: instance.port, requestPath: '/releases.json' });
    assert.equal(manifestRes.statusCode, 200);
    assert.equal(manifestRes.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(manifestRes.headers['cache-control'], 'no-store');

    const jsRes = await rawRequest({
      port: instance.port,
      requestPath: '/releases/opus-5.5-high/assets/app.js',
    });
    assert.equal(jsRes.statusCode, 200);
    assert.equal(jsRes.headers['content-type'], 'application/javascript; charset=utf-8');

    const cssRes = await rawRequest({
      port: instance.port,
      requestPath: '/releases/opus-5.5-high/assets/app.css',
    });
    assert.equal(cssRes.statusCode, 200);
    assert.equal(cssRes.headers['content-type'], 'text/css; charset=utf-8');

    const dirRedirect = await rawRequest({
      port: instance.port,
      requestPath: '/releases/opus-5.5-high',
    });
    assert.equal(dirRedirect.statusCode, 301);
    assert.equal(dirRedirect.headers.location, '/releases/opus-5.5-high/');

    const headRes = await rawRequest({
      port: instance.port,
      method: 'HEAD',
      requestPath: '/releases.json',
    });
    assert.equal(headRes.statusCode, 200);
    assert.equal(headRes.body, '');

    const postRes = await rawRequest({
      port: instance.port,
      method: 'POST',
      requestPath: '/',
    });
    assert.equal(postRes.statusCode, 405);
    assert.equal(postRes.headers.allow, 'GET, HEAD');
  });

  it('rejects path traversal and missing paths safely', async () => {
    const distDir = makeTempDist({
      'index.html': '<!doctype html>ok',
      'releases.json': '{}',
    });

    const instance = await startServer({ distDir, port: 0, autoBuild: false });
    activeServers.push(instance.server);

    const encodedTraversal = await rawRequest({
      port: instance.port,
      requestPath: '/%2e%2e/package.json',
    });
    assert.equal(encodedTraversal.statusCode, 403);

    const malformed = await rawRequest({
      port: instance.port,
      requestPath: '/%E0%A4%A',
    });
    assert.equal(malformed.statusCode, 400);

    const missing = await rawRequest({
      port: instance.port,
      requestPath: '/does-not-exist.js',
    });
    assert.equal(missing.statusCode, 404);
  });

  it('fails fast with EADDRINUSE when the requested port is already occupied', async () => {
    const distDir = makeTempDist({
      'index.html': '<!doctype html>ok',
      'releases.json': '{}',
    });

    const first = await startServer({ distDir, port: 0, autoBuild: false });
    activeServers.push(first.server);

    await assert.rejects(
      () => startServer({ distDir, port: first.port, autoBuild: false }),
      (error) => {
        assert.equal(error.code, 'EADDRINUSE');
        assert.match(error.message, new RegExp(`Port ${first.port}`));
        return true;
      }
    );
  });

  it('auto-builds when dist/ is missing and autoBuild is enabled', async () => {
    const distDir = makeTempDist();
    let buildCalls = 0;

    const instance = await startServer({
      distDir,
      port: 0,
      autoBuild: true,
      buildFn: ({ distDir: target }) => {
        buildCalls += 1;
        fs.writeFileSync(path.join(target, 'index.html'), '<!doctype html>built', 'utf8');
        fs.writeFileSync(path.join(target, 'releases.json'), '{"releases":[]}', 'utf8');
      },
    });
    activeServers.push(instance.server);

    assert.equal(buildCalls, 1);
    const res = await rawRequest({ port: instance.port, requestPath: '/' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '<!doctype html>built');
  });
});
