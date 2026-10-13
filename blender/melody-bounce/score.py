# Engraves a song as a piano score with LilyPond, and finds where each note's head was printed.
# write() makes the LilyPond source and remembers the line:column of every pitch it writes; LilyPond's point-and-click
# links on the SVG's noteheads point back to those positions, which is how a head is matched to its note.
from collections import Counter, namedtuple
import bisect, os, re, subprocess
import meter

Chord = namedtuple('Chord', 'start length pitches notes')  # start, length in grid steps; notes: indices into song.notes
Head = namedtuple('Head', 'note x y')                       # centre of the head; SVG units (staff spaces), y down

GRID = 4            # steps per quarter note: sixteenths
SPLIT = 60          # middle C: lower notes go to the bass staff
# middle C and D sit a ledger line from either staff, so they are printed with the hand that plays them: the left
# when struck with a bass-staff note at most a fourth below and under a higher note (the tune)
BETWEEN, REACH = range(SPLIT, 63), 5
# a note starting more than a quarter step off the grid was played, not written; with no grid at all half of them are,
# a written piece with a human feel a fifth
OFF_GRID, PLAYED = 0.25, 0.35
MAX_VOICES = 4      # LilyPond's voice styles: past four, the stems and rests of different voices collide
SCALE = (0, 2, 4, 5, 7, 9, 11)  # a major scale's pitch classes above its tonic
HEAD_HALF = 0.65    # half a notehead's width: LilyPond places heads by their left edge
LENGTHS = ((24, '1.'), (16, '1'), (12, '2.'), (8, '2'), (6, '4.'), (4, '4'), (3, '8.'), (2, '8'), (1, '16'))
TONICS = {-7: 'ces', -6: 'ges', -5: 'des', -4: 'aes', -3: 'ees', -2: 'bes', -1: 'f', 0: 'c',
          1: 'g', 2: 'd', 3: 'a', 4: 'e', 5: 'b', 6: 'fis', 7: 'cis'}
NAMES = ('c', None, 'd', None, 'e', 'f', None, 'g', None, 'a', None, 'b')
BLACK_FLAT = {1: 'des', 3: 'ees', 6: 'fis', 8: 'aes', 10: 'bes'}   # F#: the leading tone of the relative minor
BLACK_PLAIN = {1: 'cis', 3: 'ees', 6: 'fis', 8: 'gis', 10: 'bes'}
BLACK_SHARP = {1: 'cis', 3: 'dis', 6: 'fis', 8: 'gis', 10: 'ais'}


class Unreadable(ValueError):
    """A MIDI whose score can't be made readable: the message says why, for whoever added it."""


def check_written(song):
    """Fails unless the song has notes written on a beat grid: a recording of someone playing engraves as a thicket of
    tied odd lengths."""
    if not song.notes:
        raise Unreadable('This MIDI has no notes to engrave.')
    step = song.division / GRID
    off = sum(abs(n.tick / step - round(n.tick / step)) > OFF_GRID for n in song.notes) / len(song.notes)
    if off > PLAYED:
        raise Unreadable(f'This MIDI was recorded from someone playing, not written note by note ({off:.0%} of its notes '
                         'fall between the beats), so its score would be unreadable. Look for a sequenced version.')


def signature(song):
    """The file's key signature; for a file without one, the signature needing the fewest accidentals (ties: the
    fewest sharps or flats)."""
    if song.key is not None:
        return song.key
    used = Counter(n.pitch % 12 for n in song.notes)

    def accidentals(key):
        scale = {(7 * key + d) % 12 for d in SCALE}
        return sum(count for pc, count in used.items() if pc not in scale)
    return min(range(-6, 7), key=lambda key: (accidentals(key), abs(key)))


def chords(song):
    """A file written in two tracks has a staff each, the lower track the bass; otherwise notes below middle C go to the
    bass staff, with the middle C and D the left hand plays. Within a staff, notes sharing an onset and a length become
    one chord. Returns (treble, bass), each sorted by start."""
    step = song.division / GRID
    spans = [(round(n.tick / step), max(1, round(n.ticks / step)), n.pitch) for n in song.notes]
    staffs = _by_track(song.notes) or _in_bass(spans)
    placed = [(bass, start, length) for bass, (start, length, _) in zip(staffs, spans)]
    staves = _grouped(song, placed)
    if max(len(voices(staff)) for staff in staves) > MAX_VOICES:
        # notes held on past the ones after them, as a sequencer's sustain: each prints only up to the next onset on
        # its staff (the sound keeps their full length)
        staves = _grouped(song, _held_to_next(placed))
    return staves


def _by_track(notes):
    """For each note: whether it goes to the bass staff, by the track it is written in, when the file has two; None
    otherwise (one track for both hands, or a part each for many instruments)."""
    tracks = {}
    for n in notes:
        tracks.setdefault(n.track, []).append(n.pitch)
    if len(tracks) != 2:
        return None
    lower = min(tracks, key=lambda t: sum(tracks[t]) / len(tracks[t]))
    return [n.track == lower for n in notes]


def _in_bass(spans):
    """For each (start, length, pitch): whether it goes to the bass staff."""
    onsets = sorted({start for start, _, _ in spans})
    lowest, highest = {}, {}  # struck at each onset; sounding at each onset
    for start, length, pitch in spans:
        lowest[start] = min(lowest.get(start, pitch), pitch)
        for t in onsets[bisect.bisect_left(onsets, start):bisect.bisect_left(onsets, start + length)]:
            highest[t] = max(highest.get(t, pitch), pitch)
    return [pitch < SPLIT or (pitch in BETWEEN and pitch - REACH <= lowest[start] < SPLIT and highest[start] > pitch)
            for start, _, pitch in spans]


def _held_to_next(placed):
    starts = {staff: sorted({start for s, start, _ in placed if s == staff}) for staff in (False, True)}
    following = {staff: dict(zip(s, s[1:])) for staff, s in starts.items()}
    return [(staff, start, min(length, following[staff].get(start, start + length) - start))
            for staff, start, length in placed]


def _grouped(song, placed):
    groups = {}
    for i, key in enumerate(placed):
        groups.setdefault(key, []).append(i)
    staves = ([], [])
    for (bass, start, length), notes in sorted(groups.items()):
        notes.sort(key=lambda i: song.notes[i].pitch)
        staves[bass].append(Chord(start, length, [song.notes[i].pitch for i in notes], notes))
    return staves


def voices(staff):
    """Spread chords over as few voices as possible so no voice holds two chords at once; longer chords go first. The
    highest voice comes first, as it is printed stems up."""
    out = []
    for c in sorted(staff, key=lambda c: (c.start, -c.length)):
        free = next((v for v in out if v[-1].start + v[-1].length <= c.start), None)
        if free is None:
            out.append([c])
        else:
            free.append(c)
    pitches = [[p for c in v for p in c.pitches] for v in out]
    return [v for _, v in sorted(zip(pitches, out), key=lambda pv: -sum(pv[0]) / len(pv[0]))] or [[]]


def pitch_name(pitch, key):
    black = BLACK_FLAT if key < 0 else BLACK_SHARP if key > 0 else BLACK_PLAIN
    name = NAMES[pitch % 12] or black[pitch % 12]
    octave = pitch // 12 - 4
    return name + ("'" * octave if octave > 0 else ',' * -octave)


def lengths(steps, into_beat=0, beat=GRID):
    """Steps as tied note values; one starting into_beat steps past a beat is first tied over at the next beat."""
    if into_beat:
        first = min(steps, beat - into_beat)
        return lengths(first) + (lengths(steps - first) if steps > first else [])
    out = []
    for size, name in LENGTHS:
        while steps >= size:
            out.append(name)
            steps -= size
    return out


class Source:
    """LilyPond text plus the line:column of every pitch written into it: heads for where a note is struck, held for
    the parts it is tied on to."""

    def __init__(self):
        self.lines, self.heads, self.held = [], {}, {}

    def add(self, text):
        self.lines.append(text)

    def event(self, indent, chord, steps, rest, into_beat=0, beat=GRID):
        """One chord (or rest) on its own line, split into tied lengths."""
        parts = lengths(steps, into_beat, beat)
        for k, length in enumerate(parts):
            if chord is None:
                self.add(indent + rest + length)
                continue
            line, number = indent + '<', len(self.lines) + 1
            for name, note in zip(chord.pitches, chord.notes):
                (self.held if k else self.heads)[(number, len(line))] = note
                line += name + ' '
            self.add(line.rstrip() + '>' + length + ('~' if k < len(parts) - 1 else ''))


def write(song, path):
    """The LilyPond source for the song, written to path; returns the Source with its heads and held maps."""
    beats, unit, pickup = meter.find(song, GRID)
    key = signature(song)
    bar = beats * GRID * 4 // unit
    beat = GRID * 3 // 2 if unit == 8 and beats % 3 == 0 else GRID * 4 // unit  # 6/8, 12/8: a dotted quarter
    end = max(c.start + c.length for staff in chords(song) for c in staff)
    end += -(end - pickup) % bar
    src = Source()
    src.add('\\version "2.24.0"')
    src.add('\\header { tagline = ##f }')
    src.add('\\paper { page-breaking = #ly:one-line-breaking indent = 0 }')
    src.add('\\layout { \\context { \\Voice \\remove "Note_heads_engraver" \\consists "Completion_heads_engraver" '
            '\\remove "Rest_engraver" \\consists "Completion_rest_engraver" } }')
    src.add('\\score { \\new PianoStaff <<')
    for clef, staff in zip(('treble', 'bass'), chords(song)):
        vs = voices(staff)
        partial = f' \\partial 16*{pickup}' if pickup else ''
        src.add(f'\\new Staff {{ \\clef {clef} \\key {TONICS[key]} \\major \\time {beats}/{unit}{partial} <<')
        for v, voice in enumerate(vs):
            command = ('\\voiceOne', '\\voiceTwo', '\\voiceThree', '\\voiceFour')[v % 4] if len(vs) > 1 else ''
            src.add(f'\\new Voice {{ {command}')
            at = 0
            for c in voice + [Chord(end, 0, [], [])]:
                for start, stop, rest in _gap(staff, at, c.start, v == 0, beat):
                    src.event('  ', None, stop - start, rest, (start - pickup) % beat, beat)
                if c.length:
                    named = c._replace(pitches=[pitch_name(p, key) for p in c.pitches])
                    src.event('  ', named, c.length, '', (c.start - pickup) % beat, beat)
                at = c.start + c.length
            src.add('}')
        src.add('>> }')
    src.add('>> \\layout { } }')
    with open(path, 'w') as f:
        f.write('\n'.join(src.lines) + '\n')
    return src


def _gap(staff, start, stop, first, beat):
    """A voice's gap as (start, stop, 'r' or 's') stretches: a rest shows where the whole staff is silent (in its first
    voice only), or as a breath of less than a beat in the voice's own line; elsewhere it is skipped, invisible, as
    the other voices carry on."""
    sounding = sorted((max(c.start, start), min(c.start + c.length, stop)) for c in staff
                      if c.start < stop and c.start + c.length > start)
    out, at = [], start
    for a, b in sounding + [(stop, stop)]:
        if a > at:
            out.append((at, a, 'r' if first else 's'))
        if b > max(a, at):
            out.append((max(a, at), b, 'r' if stop - start < beat else 's'))
        at = max(at, b)
    return out


def engrave(ly):
    """LilyPond source to SVG with point-and-click links; returns the SVG path."""
    folder, name = os.path.split(ly)
    stem = os.path.splitext(name)[0]
    run = subprocess.run(['lilypond', '-dbackend=svg', '-dpoint-and-click', '-o', stem, name],
                         cwd=folder, capture_output=True, text=True)
    if run.returncode:
        raise RuntimeError(run.stderr[-2000:])
    return os.path.join(folder, stem + '.svg')


LINK = re.compile(r'textedit://[^"]*?:(\d+):(\d+):\d+"')
TRANSLATE = re.compile(r'translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)')


def _printed(svg):
    """Every linked glyph LilyPond printed: ((line, column) it came from, x, y), left to right. The score is one line,
    so that is the order they are played in; the SVG's own order is not (the heads of a note split at a barline)."""
    with open(svg) as f:
        text = f.read()
    out = []
    for m in LINK.finditer(text):
        t = TRANSLATE.search(text, m.end(), m.end() + 400)
        if t:
            out.append(((int(m.group(1)), int(m.group(2))), float(t.group(1)) + HEAD_HALF, float(t.group(2))))
    return sorted(out, key=lambda p: p[1])


def noteheads(svg, source):
    """Where each note is struck: the first head printed for it; fails if a note never got a head."""
    found = {}
    for key, x, y in _printed(svg):
        note = source.heads.get(key)
        if note is not None and note not in found:
            found[note] = Head(note, x, y)
    missing = set(source.heads.values()) - set(found)
    if missing:
        raise ValueError(f'{len(missing)} notes have no printed head, e.g. note {min(missing)}')
    return sorted(found.values())


def held_heads(svg, source):
    """The heads a note is held on to, which sound nothing new: its tied parts, and the further heads LilyPond prints
    when a note crosses a barline (they link to the same place as the first)."""
    struck, out = set(), []
    for key, x, y in _printed(svg):
        note = source.held.get(key)
        if note is None and key in source.heads:
            note = source.heads[key]
            if note not in struck:
                struck.add(note)
                continue
        if note is not None:
            out.append(Head(note, x, y))
    return out

NUMBER = r'([-\d.]+)'
# a tie, printed as a filled crescent: its upper edge from the left end to the right, then its lower edge back
TIE = re.compile(r'<g transform="translate\(\s*' + NUMBER + r'[ ,]+' + NUMBER + r'\s*\)">\s*<path [^>]*?d="M' + ' '.join([NUMBER] * 2)
                 + 'C' + ' '.join([NUMBER] * 6) + 'L' + ' '.join([NUMBER] * 2) + 'C' + ' '.join([NUMBER] * 6) + 'z"')


def ties(svg):
    """Every tie printed, as the cubic Bezier along the middle of its crescent: four (x, y) from its left end; SVG
    units, y down."""
    with open(svg) as f:
        text = f.read()
    out = []
    for m in TIE.finditer(text):
        dx, dy, x0, y0, a1, b1, a2, b2, x3, y3, _, _, c1, d1, c2, d2, _, _ = map(float, m.groups())
        # the lower edge runs back, so its second control point pairs with the upper edge's first
        out.append(((dx + x0, dy + y0), (dx + (a1 + c2) / 2, dy + (b1 + d2) / 2), (dx + (a2 + c1) / 2, dy + (b2 + d1) / 2),
                    (dx + x3, dy + y3)))
    return out


STAFF_LINE = 'staff-line'  # the importer names each object after its id, adding .001, .002, ...
LINE = re.compile(r'<line [^>]*?stroke-width="([\d.]+)"[^>]*?x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/>')


def importable(svg, out):
    """A copy Blender's SVG importer reads fully: it skips anything inside <a> (every notehead) and draws no strokes,
    so links are unwrapped and the (horizontal) staff lines become thin rectangles, named so they can be told apart."""
    with open(svg) as f:
        text = f.read()

    def rect(m):
        width, x1, y1, x2, y2 = map(float, m.groups())
        if y1 != y2:
            raise ValueError('only horizontal lines are expected')
        return (f'<rect id="{STAFF_LINE}" x="{x1}" y="{y1 - width / 2}" width="{x2 - x1}" height="{width}" '
                f'fill="currentColor"/>')

    text = re.sub(r'<a [^>]*>|</a>', '', LINE.sub(rect, text))
    with open(out, 'w') as f:
        f.write(text)
    return out


def page(svg):
    """(width, height) in metres as the SVG importer reads them, and the viewBox width in SVG units."""
    with open(svg) as f:
        head = f.read(1000)
    w, h = (float(v) for v in re.search(r'width="([\d.]+)mm" height="([\d.]+)mm"', head).groups())
    box = float(re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+)', head).group(1))
    return w / 1000, h / 1000, box
