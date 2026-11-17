# Cascade — kinetic cube sculpture

15,625 GPU-instanced cubes morphing through ten formations on a 200 s loop (sphere, torus knot, rain columns, dense spiral galaxy, helix, sliding lattice, galaxy vortex, wave plane, breathing block, Lissajous ribbons) in a dark space, with curl-style swirl, staggered per-cube transitions, evolving palettes, bloom, ACES tone mapping, vignette, chromatic aberration and grain. No UI.

All motion is computed in the vertex shader from per-instance attributes and a time uniform; the CPU only updates a handful of uniforms per frame.

## Run

```
npm install
npm run dev        # http://localhost:5173
# or
npm run build && npm run preview
```

Optional `?t=<seconds>` starts the piece at a later point in its 200 s loop.

## Capture (dev only)

```
npx playwright install chromium
node tools/capture.mjs shots 4,20,38,80      # screenshots at given times
node tools/video.mjs out.mp4 38 12 12        # start s, duration s, fps
```

## Interaction

- **Move the mouse / drag a finger** over the canvas: a small drop is injected into a screen-space wave-equation height field (256x144 half-float ping-pong target) at the pointer. The cubes sample it in the vertex shader and ripple mostly along the view direction, with tilt, shading and scale following the surface, leaving a slow water-like wake that fades in a few seconds. The system cursor stays visible.
- **Click / tap**: the sculpture shatters outward from the click point (rippling by distance, with a bloom flash), then reforms into a click-only shape. Successive clicks cycle icosahedron wireframe → sea urchin → Möbius band → dense spiral galaxy → breathing block. After a settled hold (~6.5s, with the lock flash) it flows back into the main loop where it left off. A click during a shatter or reform retargets promptly after a 0.6s cooldown, from the current positions.

Interaction capture (deterministic virtual time): `node tools/interact.mjs <outdir> [startClock]` and `node tools/interact-video.mjs <out.mp4> [startClock]`.
