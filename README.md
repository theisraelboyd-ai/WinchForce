# WinchForce

Deck rigging force planner. Lay out a line from the winch to the end over
bollards, snatch blocks, fairleads and purchases, enter one known reading, and
get the tension in every leg and the load on every point, checked against the
SWL of the rigging at that point.

Open `index.html`. Single self-contained file, works offline.

Three steps, one at a time:

1. **Lay out the line** on the grid: drag the winch and the end, add bollards,
   blocks or fairleads with the buttons on the grid.
2. **What do you know?** The winch pull, the load at the end, or a load cell
   reading (tap where it is on the grid).
3. **Is it safe?** Optional: wire, winch max pull, the limit on each point,
   heaving or paying out, heights, deck size.

Tap any point for its figures and limit. The catalogue, save/open, print and
the full working are in the menu.

Physics: capstan friction on the angle the line turns through (plus extra
full turns), fixed efficiency per sheave, n-part purchases, loads on points as
3D vector sums.

`legacy/index-v1.html` is the previous version, kept for reference. Its
friction used the angle between the two legs rather than the turn angle.

## 3D view

The cube button on the right shows the line in 3D: deck, fittings at their
heights, legs coloured by load, and an arrow on each point showing the
direction and size of the pull on it. Tap a point or a line to see its values
in the top bar; drag to turn, pinch to zoom, double-tap to reset.

The 3D code lives in `src/view3d.js` and is bundled (with three.js) into
`index.html` so the app stays a single offline file. After changing it:

    npm install && npm run build:3d
