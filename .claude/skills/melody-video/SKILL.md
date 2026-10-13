---
name: melody-video
description: Make a Polyfjord-style melody video (glowing comets landing on an engraved piano score) for any song. Use when the user asks for a melody/sheet-music bounce video of a song, or passes a .mid file.
argument-hint: <song name or path to .mid>
---

# Melody video

The pipeline lives in `blender/melody-bounce/`. `make.py` does everything headless (no open Blender needed):
prepare (LilyPond engraving, flights, synth audio) → build + frame check in Blender → save `build/<song>.blend` →
render → sync check → 3 stills.

## 1. Get the MIDI
- A path was given: use it.
- A song name was given: search for a free **solo piano** arrangement, ideally under 3 minutes. Prefer, in order:
  Mutopia Project (public domain / CC), MFiles (free piano arrangements), then other sources. Full band arrangements
  engrave as a crowded score; drums are dropped automatically.
- Download into a fresh directory (`mktemp -d`), never into the repo. Check the first 4 bytes are `MThd`.
- Inspect it before copying (isolated Python, our code on the path, the download only as an argument):
  ```bash
  python3 -I -c "import sys; sys.path.insert(0, 'blender/melody-bounce'); import midi; s = midi.load(sys.argv[1]); n = s.notes; print(len(n), 'notes', round(max(x.end for x in n)), 's, pitches', min(x.pitch for x in n), '-', max(x.pitch for x in n), 'key', s.key, 'time', s.time)" /tmp/xxx/song.mid
  ```
  Flag to the user before going on: over ~3 minutes (render time), over ~2500 notes, or no notes.
- Copy to `blender/melody-bounce/songs/<kebab-name>.mid`. Note the source URL and licence for the report.

## 2. Watch it live (default)
With the dev server running (`npm run dev`), open `/melody?song=<name>`. The first load prepares the song (~20 s:
engraving, flights, camera, audio); after that it plays at once. Any prepare.py failure shows on the page.
Only make a video (steps 3-5) if the user asks for one.

## 3. Video preview
Run in the background (takes ~3-4 min), from the repo root:
```bash
python3 blender/melody-bounce/make.py blender/melody-bounce/songs/<name>.mid
```
It fails loudly if LilyPond can't engrave, a note has no head, a comet leaves the frame, or the sound is off the first
landing by more than 1.5 frames. Quote the error; don't paper over it.

## 4. Look
Read the three stills it prints (`renders/<name>-stills/`). Check: the score reads as a grand staff, lit heads sit on
noteheads, comets are inside the frame, nothing is black or blown out. Report the sync line it printed.

## 5. Full render, on the user's go
Full 1080p60 at 16 samples takes ~50 min per minute of song: give the estimate first. Run in the background:
```bash
python3 blender/melody-bounce/make.py blender/melody-bounce/songs/<name>.mid --full
```
Then read its stills and report: the video path (`renders/<name>.mp4`), the sync line, the source and licence.
Anything not checked: say "not verified".

## Tuning
Look and timing constants are in `settings.py` (camera, samples, FPS) and `lights.py` (comet colour, glow, size).
