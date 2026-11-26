# Release Switcher

A minimal localhost frontend for switching between the three tagged releases without altering any git tag:

- **`opus-5.5-high`** — Cascade
- **`6.2-Sol-High`** — Aftermatter
- **`gemini-4-neon-high`** — Gemini 4 Neon

## Quick start

From the repository root (first run `npm --prefix switcher install` once):

```sh
npm run switcher
```

Or from the `switcher/` directory:

```sh
cd switcher
npm install
npm start
```

Open **http://localhost:3000** in a WebGL 2 browser. Click any release in the top bar to switch implementations and perform a clean reload (clicking the active release reloads it from the start).

## Configuration & commands

- **Fixed port:** Binds to `127.0.0.1:3000` (`http://localhost:3000`). Override with `PORT=<port> npm start`. If the port is already occupied, startup fails immediately with `EADDRINUSE` instead of silently picking a different port.
- **Auto-build:** `npm start` automatically builds all three tagged releases into `switcher/dist/` if the build output is missing.
- **Force rebuild:** `npm run build` extracts each git tag via `git archive` into a temporary directory, builds it with Vite (`--base=./`), and writes `switcher/dist/releases.json`.
- **Direct URL selection:** Use `/?release=opus-5.5-high`, `/?release=6.2-Sol-High`, or `/?release=gemini-4-neon-high`. Optional `?t=<seconds>` is forwarded to the active release and preserved across switches.
- **Tests:** `npm test` runs the automated Node test suite.
