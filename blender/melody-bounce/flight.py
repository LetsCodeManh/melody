# Where the lights fly: each note's comet starts at a head of the chord before it on the same staff and lands on the
# note's own head exactly at its onset. Pure maths on page coordinates (staff spaces, y up), no bpy.
from collections import namedtuple
import bisect, math

Flight = namedtuple('Flight', 'note launch land origin target')  # times in s; origin, target: (x, y) on the page
# a tied note ringing on: a glint gliding along its printed tie from start to end (s); curve: four Bezier points (x, y)
Glide = namedtuple('Glide', 'note start end curve')

MAX_FLIGHT = 0.45   # s: a comet waits on its origin through long notes, then takes at most this long to arrive
ARC = 0.35          # arc height as a share of the distance flown
MAX_ARC = 4.0       # staff spaces
ENTRY = (-12.0, 6.0)  # where the first comets of each staff come from, relative to their target
TIE_GAP = 0.05      # s: a held head the music reaches sooner than this after the note's previous head just lights with it
TIE_REACH = 2.5     # staff spaces: how far a tie's ends may sit from the heads it joins (after a dot, ~1.9)
FARTHEST = 15.0     # staff spaces: a comet from farther back (after a long rest) would pull the camera far out, so it
                    # flies in from ENTRY like a first note; about what the nearest shot shows


def flights(song, staves, heads):
    """staves: score.chords(song); heads: {note: (x, y)}. One Flight per note, sorted by landing time."""
    out = []
    for staff in staves:
        onsets = sorted({c.start for c in staff})
        by_onset = {s: sorted((n for c in staff if c.start == s for n in c.notes), key=lambda n: song.notes[n].pitch)
                    for s in onsets}
        before = None
        for s in onsets:
            notes = by_onset[s]
            for k, n in enumerate(notes):
                land = song.notes[n].start
                target = heads[n]
                prev = before and before[int(k * (len(before) - 1) / max(len(notes) - 1, 1) + 0.5)]
                if prev is None or target[0] - heads[prev][0] > FARTHEST:
                    origin, launch = (target[0] + ENTRY[0], target[1] + ENTRY[1]), land - MAX_FLIGHT
                else:
                    origin = heads[prev]
                    launch = max(song.notes[prev].start, land - MAX_FLIGHT)
                out.append(Flight(n, launch, land, origin, target))
            before = notes
    return sorted(out, key=lambda f: (f.land, f.note))


def ties(flights_, held, curves):
    """held: (note, time, x, y), page coordinates, for the heads a note rings on to (ties, heads past a barline);
    curves: the printed ties, four Bezier points (x, y) each from the left end. Nothing new sounds at a held head, so no
    comet flies to it: a glint glides along the tie from the note's previous head, setting off as the music reaches that
    one and arriving as it reaches this one. A head reached sooner than TIE_GAP after the previous gets none. Returns
    (a Flight for each of those heads, for the camera to keep both heads in shot while the note rings from one to the
    other; the glides)."""
    last = {f.note: (f.land, f.target) for f in flights_}
    free = list(curves)
    framed, glides = [], []
    for note, t, x, y in sorted(held, key=lambda h: (h[0], h[2], h[1])):
        before, origin = last[note]
        last[note] = (t, (x, y))
        curve = _tie_between(free, origin, (x, y))
        if curve:
            free.remove(curve)
        if t - before < TIE_GAP:
            continue
        framed.append(Flight(note, before, t, origin, (x, y)))
        if curve:
            glides.append(Glide(note, before, t, curve))
    return framed, glides


def _tie_between(curves, a, b):
    """The tie printed from head a to head b, if any: the one whose ends sit nearest them."""
    near = [c for c in curves if math.dist(c[0], a) < TIE_REACH and math.dist(c[3], b) < TIE_REACH]
    return min(near, key=lambda c: math.dist(c[0], a) + math.dist(c[3], b), default=None)


def bezier(curve, u):
    """Point (x, y) along a cubic Bezier at u in [0, 1]."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = curve
    a, b, c, d = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
    return a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3


def arc(flight, u):
    """Point (x, y, height) along the flight at u in [0, 1]; x and y move evenly with time."""
    (x0, y0), (x1, y1) = flight.origin, flight.target
    distance = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    height = min(ARC * distance, MAX_ARC) * 4 * u * (1 - u)
    return x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, height


def in_shot(flights_, times, linger):
    """Per time, the page (x, y) of the origin and target of every comet in the air or landed within linger seconds;
    gaps hold the nearest so the camera never loses its place."""
    out = [[p for f in flights_ if f.launch <= t <= f.land + linger for p in (f.origin, f.target)] for t in times]
    known = [i for i, v in enumerate(out) if v]
    if not known:
        raise ValueError('no flights')
    last = out[known[0]]
    for i, v in enumerate(out):
        out[i] = last = v or last
    return out


def spans(flights_, times, linger):
    """Per time, the (left, right) page x of every comet in shot."""
    return [(min(x for x, _ in ps), max(x for x, _ in ps)) for ps in in_shot(flights_, times, linger)]


def pull_back(dx, dy, camera, view):
    """How far back (1 = nearest) a camera at offset camera from the point it looks at must stand for the page point
    dx, dy from that point to be inside view, the tan of half its horizontal angle. The frame narrows towards the
    lens, so a point nearer the camera needs it further back."""
    ox, oy, oz = camera
    across = abs(dy * ox - dx * oy) / math.hypot(ox, oy)
    square = ox * ox + oy * oy + oz * oz
    return (dx * ox + dy * oy + math.sqrt(square) * across / view) / square


def framing(flights_, times, shot, middle, margin, linger, sigma, camera, view, look_y):
    """Per time, the page x the camera looks at and how far back it stands (1 = nearest, at offset camera from the
    point (x, look_y), showing the staves shot staff spaces across with their middle at x + middle), so every comet in
    the air stays in shot with margin to spare, heads off the staves too: inside view, the tan of half the lens's
    horizontal angle. Both smoothed over sigma samples, the pull-back over a running maximum so it never cuts a comet
    off."""
    seen = in_shot(flights_, times, linger)
    span = [(min(x for x, _ in ps), max(x for x, _ in ps)) for ps in seen]
    centre = smooth([(lo + hi) / 2 - middle for lo, hi in span], sigma)
    # measured from the smoothed aim, not the span's own middle: smoothing leads and lags, and the shot must cover that
    need = dilate([max([1.0, 2 * (max(hi - c - middle, c + middle - lo) + margin) / shot] +
                       # heads below the bass staff are nearer the lens, where the frame is narrower than shot
                       [pull_back(x + side - c, y - look_y, camera, view) for x, y in ps for side in (-margin, margin)])
                   for ps, (lo, hi), c in zip(seen, span, centre)], int(3 * sigma))
    return centre, smooth(need, sigma)


def reached(flights_, xs):
    """When the music reaches each page x: between the landings around it (the score's x runs with time), held at
    the first and last."""
    marks = sorted((f.target[0], f.land) for f in flights_)
    pos, times = [x for x, _ in marks], []
    for _, t in marks:
        times.append(max(t, times[-1]) if times else t)  # chords stacked at one x: never back in time
    out = []
    for x in xs:
        i = bisect.bisect_left(pos, x)
        if i == 0 or i == len(pos):
            out.append(times[min(i, len(pos) - 1)])
        else:
            (x0, t0), (x1, t1) = (pos[i - 1], times[i - 1]), (pos[i], times[i])
            out.append(t1 if x1 == x0 else t0 + (t1 - t0) * (x - x0) / (x1 - x0))
    return out


def dilate(values, radius):
    """Running maximum over ±radius samples, so smoothing a need never dips below it."""
    return [max(values[max(0, i - radius):i + radius + 1]) for i in range(len(values))]


def smooth(values, sigma):
    """Gaussian smoothing over ±3 sigma samples; looks ahead as much as behind, so a camera anticipates."""
    reach = int(3 * sigma)
    weights = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-reach, reach + 1)] if sigma > 0 else [1.0]
    reach = len(weights) // 2
    out = []
    for i in range(len(values)):
        total = norm = 0.0
        for k, w in enumerate(weights):
            j = i + k - reach
            if 0 <= j < len(values):
                total += w * values[j]
                norm += w
        out.append(total / norm)
    return out
