# WinchForce

Deck rigging force planner. Lay out a line from the winch to the end over
bollards, snatch blocks, fairleads and purchases, enter one known reading, and
get the tension in every leg and the load on every point, checked against the
SWL of the rigging at that point.

Open `index.html`. Single self-contained file, works offline.

- Known reading can be the winch pull, the end load, a load cell under a block
  (side load) or an inline load cell in one leg.
- Bollards and chocks: capstan friction on the angle the line turns through,
  plus extra full turns. Sheaves: fixed efficiency per sheave. Purchases: n-part.
- Loads on points are 3D vector sums, so heights give uplift as well as side load.
- Rigging catalogue: import CSV or paste rows from Excel; cert numbers and expiry.
- Print rigging plan with plan and side views, checks and sign-off.

`legacy/index-v1.html` is the previous version, kept for reference. Its
friction used the angle between the two legs rather than the turn angle.
