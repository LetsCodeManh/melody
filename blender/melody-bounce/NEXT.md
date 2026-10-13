# Melody: where we left off (2026-10-13)

Read this first in the next session on the melody page (`/melody?song=<name>`, dev server on port 5190).

## State
All committed on branch `melody-bounce`, nothing pending:
- `e78fddf` refuse played MIDIs, sustained notes printed to the next onset, key signature from the notes
- `68774a9` middle C and D go with the left-hand chord they are struck in
- `9d81179` delete a song from the picker (⌘⌫ or the trash button; the MIDI goes to the macOS Trash)
- `32dcd04` memory: canvas without its own MSAA, MSAA only on the composer's first buffer, vertex buffers freed
  from the CPU once on the GPU
- `809d3af`, `4e9af5d` time signatures (below)
- `92b2b00` the notes stand over the staff lines: lines half as high, a shade lighter and matte (live and Blender)
- `392839a` the camera backs off for low notes far below the bass staff (below)

Memory, All of Me at 3456×2234, headless Chrome: tab 335 → 200 MB, GPU process 1811 → 1209 MB. Manh's browser is
Comet (Chromium with extras): about 245 MB there. What is left: ~50 MB decoded audio and the browser itself.

## Done since: time signatures
`meter.py` finds the bars from the notes when a file just says 4/4 (exporters write it by default): 4/4, 3/4, 6/8,
12/8 and a pickup. Song of Storms and Interstellar are now in 3/4; the other six stay 4/4. Against 19 songs with a known
meter (11 downloaded for it: Mutopia and MFiles), 17 come out exactly right. The two misses are not worth rules yet:
- Für Elise: the file plays a repeat without its short bar, so the bars shift after bar 8 (a meter change mid-song,
  skipped). One offset fits the rest; the opening is barred off.
- Chopin Nocturne Op. 9/2 (12/8): its pickup lands half a bar off (beat one and the middle of the bar fit about as well).
A file's time signature now means the one lasting longest (MFiles opens with a 1/8 pickup bar).

## Done since: every comet in frame
`check.py` failed 9 of 19 songs (Nocturne worst, half a frame out): heads far below the bass staff are nearer the
lens, where the frame is narrower than the 19-wide shot measured on the staves. `flight.framing` now also puts each
head through the real perspective (`pull_back`) and backs off further when one needs it; the old width stays the floor,
so songs without low notes frame exactly as before. All 19 pass. Not yet looked at by eye on the page.

## Done since: the score's mesh built 3× faster
`extrude.ts` writes the print's solids straight into one buffer, the same vertices as three's `ExtrudeGeometry` (pinned
by `extrude.spec.ts`; all 19 songs match to 2e-9, the page pixel for pixel). All of Me: 660 → 205 ms, 570 → 114 MB
allocated (most of what is left is SVGLoader). No mesh cache: not needed at 200 ms, and it would be 50 MB a song.
The tab's peak on a switch did not move (~350 MB, ~175 after GC): the garbage was young and swept as it went. The peak is
big buffers waiting for a full GC (the new WAV and its decoded audio, the last song's audio, the uploaded mesh), bounded,
not a leak.

## Next, in order
1. **GPU work.** The depth-of-field pass renders the whole score (2.1 M vertices) a second time each frame. Measure
   frame time on a long song before touching it.
2. **Small:** deleting the last song (empty state) was never verified; after a GPU reset the freed meshes can't be
   re-uploaded, so a "reload the page" message would help.

## Skipped on purpose (YAGNI)
More than two staves for orchestras (everything folds into piano staves); streaming the audio (risks the sync);
meter changes mid-song, odd meters (5/4, 7/8) found from the notes, triplets and swing (the grid is sixteenths).

## Gotchas
- Changing `score.py`, `meter.py` or any other file in `SOURCES` (`songs.server.ts`), even restoring it with `cp`, re-prepares every song on its next load: up to ~100 s each.
  Restore with git, and warm songs with curl before browser checks.
- Quote URLs with `?` in zsh: `curl 'http://localhost:5190/melody?song=x'`.
- Memory: measure per process with `footprint <pid>` (renderer = the tab, gpu-process = the GPU) while a song
  plays, after `HeapProfiler.collectGarbage` over CDP; the JS heap alone misses ArrayBuffers and audio.
- Frame-check every song (~10 min; prepare first if pipeline files changed):
  `for f in blender/melody-bounce/build/*.json; do /Applications/Blender.app/Contents/MacOS/Blender -b
  --python-exit-code 1 --addons io_curve_svg --python blender/melody-bounce/build.py --python
  blender/melody-bounce/check.py -- $f 2>&1 | grep -E "comet points|leave the frame"; done`
- Songs are private: `songs/` stays untracked; downloads go into a fresh `mktemp -d`, read with `python3 -I`.
