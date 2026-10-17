# WinchForce — ideas for later

Things the 3D geometry makes possible but which aren't built yet. Each needs a
little more input from the user than the app asks for today.

## Padeye and shackle side-loading
Give each padeye the direction it faces (its plane). Show the angle the line
pulls out of that plane and flag side-loading beyond the usual limits, since
side-loading reduces a padeye's and a shackle's capacity.

## Fleet angle at the winch
Give the winch drum's facing direction. Show the lead angle off the drum to
the first sheave or fairlead and flag anything beyond the usual limits for wire
(smooth and grooved drums differ), to catch bad spooling and flange rubbing.

## Clearances and chafe
The line already gets a marker where it passes through the deck. Next: let the
user drop simple boxes for hatch coamings, rails, bulwarks or structure, and
flag any leg that passes through one (contact / chafe point).

## Wire weight and sag
Legs are drawn straight and the wire's weight is ignored. For long or heavy
spans, add the catenary sag and the extra tension at the high end from the
wire's weight per metre (the Catenary tool already has this maths).

## Already done (for reference)
- Load on every point split into side pull and up/down pull.
- Bollards: bare post or snatch block on top, foot height, bending moment at
  the foot (side pull × lever) with an optional limit that counts toward use.
