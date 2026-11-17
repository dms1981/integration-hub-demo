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

## Interaction

- **Move the mouse / drag a finger** over the canvas: cubes near the pointer part like sand, tumble and glow, then slowly coalesce back (~2.5s). The last 32 pointer positions are passed as a uniform array and the wake is computed per-vertex in the shader; no cursor is drawn.
- **Click / tap**: the sculpture shatters outward from the click point (rippling by distance, with a bloom flash), then reforms into a click-only shape. Successive clicks cycle icosahedron wireframe → sea urchin → Möbius band. After a settled hold (~6.5s, with the lock flash) it flows back into the main loop where it left off. Clicks during a shatter or release are queued and applied once settled, so nothing pops.

Interaction capture (deterministic virtual time): `node tools/interact.mjs <outdir> [startClock]` and `node tools/interact-video.mjs <out.mp4> [startClock]`.
