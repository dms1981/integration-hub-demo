# Release Switcher

A minimal localhost frontend for switching between the two tagged releases without altering either git tag:

- **`opus-5.5-high`** — Cascade
- **`6.2-Sol-High`** — Aftermatter

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

Open **http://localhost:3000** in a WebGL 2 browser. Click the button at the top of the page to switch to the other implementation and perform a clean reload.

## Configuration & commands

- **Fixed port:** Binds to `127.0.0.1:3000` (`http://localhost:3000`). Override with `PORT=<port> npm start`. If the port is already occupied, startup fails immediately with `EADDRINUSE` instead of silently picking a different port.
- **Auto-build:** `npm start` automatically builds both tagged releases into `switcher/dist/` if the build output is missing.
- **Force rebuild:** `npm run build` extracts each git tag via `git archive` into a temporary directory, builds it with Vite (`--base=./`), and writes `switcher/dist/releases.json`.
- **Direct URL selection:** Use `/?release=opus-5.5-high` or `/?release=6.2-Sol-High`. Optional `?t=<seconds>` is forwarded to the active release and preserved across switches.
- **Tests:** `npm test` runs the automated Node test suite.
