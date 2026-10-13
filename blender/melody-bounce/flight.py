# Where the lights fly: each note's comet starts at a head of the chord before it on the same staff and lands on the
# note's own head exactly at its onset. Pure maths on page coordinates (staff spaces, y up), no bpy.
from collections import namedtuple
import bisect, math

Flight = namedtuple('Flight', 'note launch land origin target')  # times in s; origin, target: (x, y) on the page

MAX_FLIGHT = 0.45   # s: a comet waits on its origin through long notes, then takes at most this long to arrive
ARC = 0.35          # arc height as a share of the distance flown
MAX_ARC = 4.0       # staff spaces
ENTRY = (-12.0, 6.0)  # where the first comets of each staff come from, relative to their target
TIE_GAP = 0.05      # s: a held head the music reaches sooner than this after the note's previous head just lights with it
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


def ties(flights_, held):
    """held: (note, time, x, y), page coordinates, for the heads a note rings on to (ties, heads past a barline). A comet
    for each, flying along from the note's previous head and landing as the music reaches it, so every head that lights
    is flown to. Returns (those flights, the held heads reached too soon after the previous one to fly to)."""
    last = {f.note: (f.land, f.target) for f in flights_}
    out, still = [], []
    for note, t, x, y in sorted(held, key=lambda h: (h[0], h[1], h[2])):
        before, origin = last[note]
        if t - before < TIE_GAP:
            still.append((note, t, x, y))
        else:
            out.append(Flight(note, max(before, t - MAX_FLIGHT), t, origin, (x, y)))
        last[note] = (t, (x, y))
    return out, still


def arc(flight, u):
    """Point (x, y, height) along the flight at u in [0, 1]; x and y move evenly with time."""
    (x0, y0), (x1, y1) = flight.origin, flight.target
    distance = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
    height = min(ARC * distance, MAX_ARC) * 4 * u * (1 - u)
    return x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, height


def spans(flights_, times, linger):
    """Per time, the (left, right) page x of every comet in the air or landed within linger seconds; gaps hold the
    nearest span so the camera never loses its place."""
    out = []
    for t in times:
        xs = [x for f in flights_ if f.launch <= t <= f.land + linger for x in (f.origin[0], f.target[0])]
        out.append((min(xs), max(xs)) if xs else None)
    known = [i for i, v in enumerate(out) if v]
    if not known:
        raise ValueError('no flights')
    last = out[known[0]]
    for i, v in enumerate(out):
        out[i] = last = v or last
    return out


def framing(flights_, times, shot, middle, margin, linger, sigma):
    """Per time, the page x the camera looks at and how far back it stands (1 = nearest, showing shot staff spaces
    across with their middle at x + middle), so every comet in the air stays in shot with margin to spare; both
    smoothed over sigma samples, the pull-back over a running maximum so it never cuts a comet off."""
    span = spans(flights_, times, linger)
    centre = smooth([(lo + hi) / 2 - middle for lo, hi in span], sigma)
    # measured from the smoothed aim, not the span's own middle: smoothing leads and lags, and the shot must cover that
    need = dilate([max(1.0, 2 * (max(hi - c, c - lo) + margin) / shot)
                   for (lo, hi), c in zip(span, (c + middle for c in centre))], int(3 * sigma))
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
