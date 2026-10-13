# Finds a song's meter: how many beats a bar holds, and how much of a bar comes before the first full one (a pickup).
# MIDI exporters write 4/4 when nobody set a meter, so a file's lone 4/4 is only a guess and the bars are found from
# the notes. The music lands hardest on beat one: where the bass strikes, chords are struck and long notes start. The
# bar length and offset that put those landings on beat one win; 4/4 stays unless another meter is clearly better.
from collections import namedtuple
import bisect

Meter = namedtuple('Meter', 'beats unit pickup')  # pickup: grid steps before the first full bar, 0 for none

BASS = 2.0     # a strike at least as low as everything struck within a beat of it
CHORD = 0.25   # each note struck at once
CLEAR = 1.25   # how much better than the plainer reading (4/4, no pickup, the shorter bar) a reading must fit
SHORTEST = 16  # quarters from the first onset to the last: anything shorter is too little to tell bars by


def find(song, grid):
    """The song's Meter; grid: steps per quarter note."""
    accents = _accents(song, grid)
    if max(accents) - min(accents) < SHORTEST * grid:
        return Meter(*song.time, 0)
    if song.time != (4, 4):
        beats, unit = song.time
        return Meter(beats, unit, _downbeat(accents, beats * grid * 4 // unit, grid)[1])
    four = _downbeat(accents, 4 * grid, grid)
    three = _downbeat(accents, 3 * grid, grid)
    if three[0] <= four[0] * CLEAR:
        return Meter(4, 4, four[1])
    if not _compound(accents, three[1], grid):
        return Meter(3, 4, three[1])
    # every other bar landing clearly harder: bars of 12/8
    offset = _downbeat(accents, 6 * grid, grid)[1]
    if _landing(accents, 6 * grid, offset, {0}) > _landing(accents, 6 * grid, offset, {3 * grid}) * CLEAR:
        return Meter(12, 8, offset)
    return Meter(6, 8, three[1])


def _accents(song, grid):
    """Grid step -> how hard the music lands there."""
    step = song.division / grid
    struck = {}
    for n in song.notes:
        struck.setdefault(round(n.tick / step), []).append((n.pitch, max(1, round(n.ticks / step))))
    onsets = sorted(struck)
    lowest = [min(p for p, _ in struck[t]) for t in onsets]
    out = {}
    for i, t in enumerate(onsets):
        near = lowest[bisect.bisect_left(onsets, t - grid):bisect.bisect_right(onsets, t + grid)]
        out[t] = (max(n for _, n in struck[t]) / grid + CHORD * len(struck[t])
                  + (BASS if lowest[i] <= min(near) else 0))
    return out


def _fit(accents, bar, offset, grid):
    """How much harder the music lands on beat one, bars starting at offset, than on the other eighths."""
    eighth = grid // 2
    first, last = min(accents), max(accents)
    ones, others = [], []
    for t in range(first - first % eighth, last + 1, eighth):
        (ones if (t - offset) % bar == 0 else others).append(accents.get(t, 0))
    return (sum(ones) / max(1, len(ones))) / (sum(others) / max(1, len(others)) or 1)


def _downbeat(accents, bar, grid):
    """(fit, offset): where the bars of that length start best, in grid steps from 0. No pickup unless one is
    clearly better."""
    fits = {offset: _fit(accents, bar, offset, grid) for offset in range(0, bar, grid // 2)}
    best = max(fits, key=fits.get)
    return (fits[best], best) if fits[best] > fits[0] * CLEAR else (fits[0], 0)


def _compound(accents, offset, grid):
    """Whether bars of three quarters starting at offset split into two dotted quarters (6/8) rather than three
    quarters (3/4): the music lands harder halfway through the bar than on its second and third beats."""
    bar = 3 * grid
    return _landing(accents, bar, offset, {bar // 2}) > _landing(accents, bar, offset, {grid, 2 * grid})


def _landing(accents, bar, offset, at):
    """How hard the music lands on average at those steps into bars starting at offset, silent ones included."""
    hits = [accents.get(t, 0) for t in range(min(accents), max(accents) + 1) if (t - offset) % bar in at]
    return sum(hits) / max(1, len(hits))
