# Cascade — kinetic cube sculpture

15,625 GPU-instanced cubes morphing through eight formations (sphere, torus knot, rain columns, triple helix, lattice, galaxy vortex, wave plane, Lissajous ribbons) in a dark space, with curl-style swirl, staggered per-cube transitions, evolving palettes, bloom, ACES tone mapping, vignette, chromatic aberration and grain. No UI.

All motion is computed in the vertex shader from per-instance attributes and a time uniform; the CPU only updates a handful of uniforms per frame.

## Run

```
npm install
npm run dev        # http://localhost:5173
# or
npm run build && npm run preview
```

Optional `?t=<seconds>` starts the piece at a later point in its 120 s loop.

## Capture (dev only)

```
npx playwright install chromium
node tools/capture.mjs shots 4,20,38,80      # screenshots at given times
node tools/video.mjs out.mp4 38 12 12        # start s, duration s, fps
```
