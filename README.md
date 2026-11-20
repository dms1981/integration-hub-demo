# Aftermatter

A continuous kinetic sculpture in five movements. 12,288 cubes pass through a
braided ribbon, a waterfall, a vortex, a lattice, and a bloom before returning
to the opening form. The 81-second score has no sound.

```sh
npm ci
npm run dev
```

Open the loopback address printed by Vite in a WebGL 2 browser. Nothing is
hosted externally. `npm run build` makes a production build; `npm run preview`
serves it locally.

Move the pointer through the sculpture to part cubes and leave a diverging wake;
click to scatter the cubes into the next form. The sculpture holds a still pose when the system's
reduced-motion preference is enabled; clicking changes that pose without
animation. To study a particular frame, add `?t=21` to the URL (seconds into
the score); pinned frames do not respond to interaction.

With the development server running, open `/tests/ripple.html` for the WebGL
displacement regression and `/tests/wake-input.html` for the pointer lifecycle
regression.
