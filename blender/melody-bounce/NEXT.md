# Melody: where we left off (2026-10-12)

Read this first in the next session on the melody page (`/melody?song=<name>`, dev server on port 5190).

## State
All committed on branch `melody-bounce`, nothing pending:
- `e78fddf` refuse played MIDIs, sustained notes printed to the next onset, key signature from the notes
- `68774a9` middle C and D go with the left-hand chord they are struck in
- `9d81179` delete a song from the picker (⌘⌫ or the trash button; the MIDI goes to the macOS Trash)
- `32dcd04` memory: canvas without its own MSAA, MSAA only on the composer's first buffer, vertex buffers freed
  from the CPU once on the GPU

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

## Next, in order
1. **Loading spike.** Building the score from the SVG makes ~130 MB of garbage per song load (thousands of
   `ExtrudeGeometry` merged in `src/lib/melody/score.ts`); the tab climbs to ~340 MB after a few switches until GC.
   Write the vertices into one buffer directly, or prepare the mesh in Python. Measure first.
2. **GPU work.** The depth-of-field pass renders the whole score (2.1 M vertices) a second time each frame. Measure
   frame time on a long song before touching it.
3. **Small:** deleting the last song (empty state) was never verified; after a GPU reset the freed meshes can't be
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
- Songs are private: `songs/` stays untracked; downloads go into a fresh `mktemp -d`, read with `python3 -I`.
