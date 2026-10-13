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

## Next, in order
1. **Time signatures.** Song of Storms is a waltz but barred in 4/4. The last known "weird engraving".
2. **Loading spike.** Building the score from the SVG makes ~130 MB of garbage per song load (thousands of
   `ExtrudeGeometry` merged in `src/lib/melody/score.ts`); the tab climbs to ~340 MB after a few switches until GC.
   Write the vertices into one buffer directly, or prepare the mesh in Python. Measure first.
3. **GPU work.** The depth-of-field pass renders the whole score (2.1 M vertices) a second time each frame. Measure
   frame time on a long song before touching it.
4. **Small:** deleting the last song (empty state) was never verified; after a GPU reset the freed meshes can't be
   re-uploaded, so a "reload the page" message would help.

## Skipped on purpose (YAGNI)
More than two staves for orchestras (everything folds into piano staves); streaming the audio (risks the sync).

## Gotchas
- Changing `score.py` (even restoring it with `cp`) re-prepares every song on its next load: up to ~100 s each.
  Restore with git, and warm songs with curl before browser checks.
- Quote URLs with `?` in zsh: `curl 'http://localhost:5190/melody?song=x'`.
- Memory: measure per process with `footprint <pid>` (renderer = the tab, gpu-process = the GPU) while a song
  plays, after `HeapProfiler.collectGarbage` over CDP; the JS heap alone misses ArrayBuffers and audio.
- Songs are private: `songs/` stays untracked; downloads go into a fresh `mktemp -d`, read with `python3 -I`.
