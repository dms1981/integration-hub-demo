import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SWITCHER_DIR = __dirname;
export const REPO_ROOT = path.resolve(SWITCHER_DIR, '..');
export const PUBLIC_DIR = path.join(SWITCHER_DIR, 'public');
export const DIST_DIR = path.join(SWITCHER_DIR, 'dist');

export const RELEASES = [
  {
    id: 'opus-5.5-high',
    tag: 'opus-5.5-high',
    label: 'Cascade',
  },
  {
    id: '6.2-Sol-High',
    tag: '6.2-Sol-High',
    label: 'Aftermatter',
  },
  {
    id: 'gemini-4-neon-high',
    tag: 'gemini-4-neon-high',
    label: 'Gemini 4 Neon',
  },
];

export function resolveTagCommit(tag, repoRoot = REPO_ROOT) {
  return execFileSync('git', ['rev-parse', `${tag}^{commit}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function resolveNodeModulesDir(switcherDir = SWITCHER_DIR, repoRoot = REPO_ROOT) {
  const candidates = [
    path.join(switcherDir, 'node_modules'),
    path.join(repoRoot, 'node_modules'),
  ];

  for (const dir of candidates) {
    const viteBin = path.join(dir, 'vite', 'bin', 'vite.js');
    const threePkg = path.join(dir, 'three', 'package.json');
    if (fs.existsSync(viteBin) && fs.existsSync(threePkg)) {
      return dir;
    }
  }

  throw new Error(
    `Could not find installed "vite" and "three" dependencies in ${candidates.join(' or ')}. ` +
      'Run "npm install" inside switcher/ first.'
  );
}

export function createManifest(builtReleases, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(builtReleases) || builtReleases.length === 0) {
    throw new Error('At least one release is required to create a manifest.');
  }

  const releases = builtReleases.map((release) => ({
    id: release.id,
    tag: release.tag,
    label: release.label,
    commit: release.commit,
    shortCommit: release.commit.slice(0, 7),
    entry: `./releases/${release.id}/index.html`,
  }));

  return {
    defaultRelease: releases[0].id,
    generatedAt,
    releases,
  };
}

export function extractGitTag(tag, targetDir, repoRoot = REPO_ROOT) {
  const archivePath = path.join(targetDir, `${tag}.tar`);
  const sourceDir = path.join(targetDir, 'src');
  fs.mkdirSync(sourceDir, { recursive: true });

  execFileSync('git', ['archive', '--format=tar', `--output=${archivePath}`, tag], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  execFileSync('tar', ['-xf', archivePath, '-C', sourceDir], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return sourceDir;
}

export function buildRelease({
  release,
  distDir = DIST_DIR,
  repoRoot = REPO_ROOT,
  nodeModulesDir,
}) {
  const commit = resolveTagCommit(release.tag, repoRoot);
  const outDir = path.join(distDir, 'releases', release.id);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `release-switcher-${release.id}-`));

  try {
    const sourceDir = extractGitTag(release.tag, tempRoot, repoRoot);
    const linkedNodeModules = path.join(sourceDir, 'node_modules');
    if (!fs.existsSync(linkedNodeModules)) {
      fs.symlinkSync(nodeModulesDir, linkedNodeModules, 'junction');
    }

    const viteBin = path.join(nodeModulesDir, 'vite', 'bin', 'vite.js');
    fs.mkdirSync(outDir, { recursive: true });

    execFileSync(
      process.execPath,
      [viteBin, 'build', '--base=./', '--outDir', outDir, '--emptyOutDir'],
      {
        cwd: sourceDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
      }
    );

    const entryHtml = path.join(outDir, 'index.html');
    if (!fs.existsSync(entryHtml)) {
      throw new Error(`Expected built entry file at ${entryHtml}, but it was not generated.`);
    }

    return {
      ...release,
      commit,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function copyPublicFiles(publicDir = PUBLIC_DIR, distDir = DIST_DIR) {
  if (!fs.existsSync(publicDir)) {
    throw new Error(`Public directory not found: ${publicDir}`);
  }

  fs.mkdirSync(distDir, { recursive: true });
  fs.cpSync(publicDir, distDir, { recursive: true });
}

export function buildAllReleases({
  releases = RELEASES,
  switcherDir = SWITCHER_DIR,
  repoRoot = REPO_ROOT,
  publicDir = PUBLIC_DIR,
  distDir = DIST_DIR,
} = {}) {
  const nodeModulesDir = resolveNodeModulesDir(switcherDir, repoRoot);

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const builtReleases = [];
  for (const release of releases) {
    console.log(`[switcher] Building ${release.label} (${release.tag})...`);
    const built = buildRelease({
      release,
      distDir,
      repoRoot,
      nodeModulesDir,
    });
    builtReleases.push(built);
  }

  copyPublicFiles(publicDir, distDir);

  const manifest = createManifest(builtReleases);
  const manifestPath = path.join(distDir, 'releases.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`[switcher] Built ${manifest.releases.length} releases into ${distDir}`);
  return manifest;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    buildAllReleases();
  } catch (error) {
    console.error(`[switcher] Build failed: ${error.message}`);
    process.exit(1);
  }
}
