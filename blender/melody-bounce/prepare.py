# Everything that doesn't need Blender: engrave the score, find its heads, plan the flights, render the audio.
# Writes build/<song>.json (+ .ly, .svg, .wav) for build.py to read inside Blender. Takes ~10 s plus the audio.
#   python3 blender/melody-bounce/prepare.py blender/melody-bounce/songs/<song>.mid
import json, math, os, sys
import flight, midi, score, settings, synth

HERE = os.path.dirname(os.path.abspath(__file__))


def prepare(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(HERE, 'build', stem)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    song = midi.load(path)
    score.check_written(song)
    staves = score.chords(song)
    mapped = score.write(song, out + '.ly')
    svg = score.engrave(out + '.ly')
    heads = {h.note: (h.x, -h.y) for h in score.noteheads(svg, mapped)}  # page coordinates: y up
    flights = flight.flights(song, staves, heads)
    held = score.held_heads(svg, mapped)
    # a held head lights when the music reaches it, never outside its own note
    reach = flight.reached(flights, [h.x for h in held])
    held_at = [(h.note, min(max(t, song.notes[h.note].start), song.notes[h.note].end), h.x, -h.y) for h, t in zip(held, reach)]
    tied, held_at = flight.ties(flights, held_at)
    flights = sorted(flights + tied, key=lambda f: (f.land, f.note))
    synth.render(song.notes, out + '.wav')
    width, height, box = score.page(svg)
    end = max(n.end for n in song.notes)
    s = settings
    times = [i / s.FPS - s.LEAD for i in range(int(math.ceil(1 + (s.LEAD + end + s.TAIL) * s.FPS)))]
    centre, back = flight.framing(flights, times, s.SHOT, s.SHOT_MIDDLE, s.MARGIN, s.LINGER, s.SMOOTH * s.FPS,
                                   s.CAMERA, s.VIEW, s.STAFF_MID)
    data = {
        'svg': score.importable(svg, out + '.blender.svg'), 'score': svg, 'wav': out + '.wav',
        'page': {'width': width, 'height': height, 'box': box},
        'end': end,
        # one sample per frame from -LEAD s, shared by Blender and the live page so both frame the same
        'camera': {'centre': [round(c, 6) for c in centre], 'back': [round(b, 6) for b in back]},
        'settings': {'fps': s.FPS, 'lead': s.LEAD, 'staffMid': s.STAFF_MID, 'camera': s.CAMERA, 'lamp': s.LAMP,
                     'arc': flight.ARC, 'maxArc': flight.MAX_ARC},
        'flights': [[f.note, f.launch, f.land, *f.origin, *f.target] for f in flights],
        'held': [list(h) for h in held_at],
        'notes': [[n.pitch, n.velocity, round(n.end - n.start, 4)] for n in song.notes],
    }
    with open(out + '.json', 'w') as f:
        json.dump(data, f)
    return out + '.json', len(flights)


if __name__ == '__main__':
    try:
        print(*prepare(sys.argv[1]))
    except score.Unreadable as e:
        sys.exit(str(e))  # the page shows stderr's last lines: the reason alone, no traceback
