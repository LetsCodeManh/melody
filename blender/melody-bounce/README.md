# Melody bounce

A song as light on a printed score. A MIDI file is engraved as sheet music lying on paper in a dark room. Each note
is a comet that flies in an arc from the chord before it and lands on its own notehead the moment the note sounds,
lighting it. A low camera glides along the score, pulling back when the music leaps, so every comet in the air stays
in shot.

It runs in two places from one prepared song:
- **Live** in the browser at `/melody?song=<name>` (three.js, `src/lib/melody/`), the default.
- **As a video** rendered in Blender (`make.py`), on request.

How to add a song, preview and render it is in the `melody-video` skill (`.claude/skills/melody-video`). Where work
left off is in `NEXT.md`.

## The idea, and why it holds together
- **Sync by construction.** The audio is synthesized from the same notes the comets land on (`synth.py`, a soft
  mallet tone), so picture and sound can't drift. The live page also keeps time by the audio clock.
- **A real score, not a piano roll.** LilyPond engraves it, so it reads as sheet music: two staves (a grand staff),
  key signature, beams and ties. Every coloured light sits on a real notehead.
- **One plan, two renderers.** `prepare.py` does everything that needs no Blender and writes `build/<song>.json`. Both
  Blender and the browser read it, so they frame and time each shot the same way.

## Pipeline
```
songs/<song>.mid
  └ prepare.py  (pure Python + LilyPond, ~10 s plus the audio)
      midi.py      reads the notes, drops drums
      meter.py     finds the bars: meter and pickup
      score.py     refuses played MIDIs, splits the hands, writes LilyPond, engraves the SVG, finds every notehead
      flight.py    plans one comet per note, then the camera's framing
      synth.py     renders the WAV
      → build/<song>.json  .ly  .svg  .blender.svg  .wav
  ├ live page   api/melody/<song> runs prepare.py on first load; three.js draws it
  └ make.py     build.py + check.py in Blender headless → build/<song>.blend → render → sync check → stills
```

## The score (`score.py`)
- **Refuses played MIDIs.** A recording of someone playing, not quantized, engraves as an unreadable score. If over
  35% of onsets fall more than a quarter step off the sixteenth grid, it refuses with a message the page shows.
- **Two hands.** Notes from middle C up go on the upper staff. Middle C to D go down instead when they are struck with
  a left-hand chord at most a fourth below them and a higher note is sounding, so the tune stays alone on top.
- **At most four voices a staff.** If a staff needs more, every note is printed only up to the next onset on its
  staff.
- **Key signature** from the file. A file without one gets the signature (up to six sharps or flats) that leaves the
  fewest notes needing an accidental.
- **Meter** (`meter.py`). Exporters write 4/4 when nobody set a meter, so a file's lone 4/4 is ignored and the bars
  come from the notes: the bar length and offset that put the bass strikes, chords and long notes on beat one win.
  That gives 4/4, 3/4, 6/8 or 12/8, plus a pickup. 4/4 with no pickup stays unless another reading fits 25% better.
  Any other meter in the file is kept, and only its pickup is found. Songs under 16 quarters keep the file's meter.
  Not handled: meter changes mid-song, odd meters found from the notes, triplets.
- Positions: page units are **staff spaces**, y up. In Blender one staff space is 5 cm (`SPACE`), so a one-minute score
  is about 30 m long.

## The comets (`flight.py`)
- Each note's comet starts at a head of the chord before it **on the same staff**, matched by position in the chord
  (lowest to lowest, highest to highest), and lands on its own head exactly at its onset.
- It waits on its origin through long notes, then takes at most 0.45 s to arrive. The arc rises 35% of the distance
  flown, at most 4 staff spaces.
- First notes, and notes after a long rest (over 15 staff spaces back), fly in from off to the left instead.
- Tied notes and heads past a barline get their own comet too, landing as the music reaches them, so every head that
  lights was flown to.

## The camera (`flight.framing`, `settings.py`)
- **Lens:** 50 mm on a 36 mm sensor. The live page keeps the same horizontal view whatever the window's shape.
- **Position:** offset (-20, -22, 6) staff spaces from the point it looks at: behind and to the left, low over the
  paper (about 11° up), looking along the score. The point looked at sits between the two staves and rides along x.
- **Framing, per frame:** take every comet in the air (or landed in the last 0.4 s) and aim at the middle of their
  span. If the span plus a 2-staff-space margin is wider than the 19 staff spaces the nearest shot shows, the camera
  backs off along its view by that ratio. Low notes far below the bass staff are nearer the lens, where the frame is
  narrower, so each head is also put through the real perspective and the camera backs off further if one needs it.
- **Smooth, never late:** the pull-back gets a running maximum first, so smoothing can't cut a comet off. Then both
  aim and pull-back get Gaussian smoothing with sigma 1 s, which looks ahead as much as behind: the camera anticipates
  the music.
- **Light:** a dim fill lamp rides along with the camera, offset (-3, 0, 5) from the point looked at. The lit heads'
  glow does the real lighting.
- **Depth of field:** focus on the point looked at (f/1.2 in Blender), so the score blurs away into the dark.

## Blender (`build.py`, `lights.py`, `check.py`)
- The score is the engraved SVG imported as curves, filled and merged into two meshes: the print 1.5 mm off the paper,
  glossy black, and the staff lines half as high, a shade lighter and matte, so the notes stand over the lines.
- Each comet is a curve whose visible stretch (bevel start and end) is keyframed, so no frame handlers are needed.
  Heads share one material and glow from a per-head property.
- EEVEE at 16 samples (looks the same as 64 here), 1080p60, bloom in the compositor, AgX Punchy.
- `check.py` fails the build if any comet leaves the frame. `make.py` fails if the sound is off the first landing by
  more than 1.5 frames.
- Cost: a 10 s preview takes ~3-4 min; a full render ~50 min per minute of song.

## Live page (`src/lib/melody/`)
- Same plan as Blender, with live-only touches:
  - comets coloured by pitch and sized by weight
  - ripples and sparks where they land, heads cooling to embers and going dark
  - the print raised 0.1 staff spaces, the staff lines half that, lighter and matte, as in Blender
  - a curtain: the light rises at the start and fades to black at the end
- Comets, heads, ripples and sparks are one draw each, moved on the GPU by a time uniform: nothing is updated per note
  per frame.
- Memory (All of Me, Retina): tab ~200 MB, GPU ~1.2 GB. MSAA is kept only where the scene is drawn, and vertex
  buffers leave the CPU once they are on the GPU.
- Songs can be added (press A, or drop a .mid on the page) and deleted (⌘⌫ moves it to the Trash). Songs are private: `songs/` is never
  committed.
