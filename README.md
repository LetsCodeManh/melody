# Melody

A song as light on a printed score. A MIDI file is engraved as sheet music lying on paper in a dark room; each note is
a comet that arcs in from the chord before it and lands on its own notehead the moment it sounds, lighting it. A low
camera glides along the score and pulls back when the music leaps. Inspired by Polyfjord's melody videos.

It plays live in the browser (three.js) and renders to video in Blender, both from the same prepared song.

## Run it
Needs Node 22+, pnpm, Python 3 and [LilyPond](https://lilypond.org) (`brew install lilypond`).

```bash
pnpm install
pnpm dev
```

Open the page, drop a `.mid` file on it (or put one in `blender/melody-bounce/songs/`) and pick it. The first play
engraves it and plans the flights (~20 s); after that it starts at once. Solo piano arrangements work best.

## Songs on the site
Eleven public-domain piano pieces, their MIDIs from the [Mutopia Project](https://www.mutopiaproject.org), each
checked against its edition's print:

- Bach: [Prelude No. 1 in C, BWV 846](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=5),
  [Minuet in G, BWV Anh. 114](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=75),
  [Invention No. 4, BWV 775](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=67),
  [Invention No. 8, BWV 779](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=61)
- Burgmüller: [Arabesque, Op. 100 No. 2](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=203)
- Chopin: Preludes Op. 28 [No. 4](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=468),
  [No. 6](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=469),
  [No. 7](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=470),
  [No. 20](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=472)
- Clementi: [Sonatina Op. 36 No. 1, 1st movement](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=804)
- Satie: [Gymnopédie No. 1](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37)

Your own MIDIs stay out of git: most songs are under copyright.

## Add a song to the site
A deployed site (Vercel, Netlify…) can't prepare songs: that takes Python and LilyPond. Prepare them on your machine
and publish the ones the site should play, then commit and push. Publishing also needs ffmpeg (`brew install ffmpeg`):
the site's audio is FLAC.

1. Find a solo piano MIDI you may share (public domain or CC0). Mutopia's are written in two tracks, one per hand,
   which gives the right staves.
2. Put it in `blender/melody-bounce/songs/<song>.mid` and print it:
   `python3 blender/melody-bounce/engrave.py blender/melody-bounce/songs/<song>.mid` writes `build/<song>.pdf`.
   Compare it with the source's own PDF, bar for bar. If the print is wrong, so is everything built on it.
3. Play it on the page (`pnpm dev`), then publish it, and let its MIDI into git (`blender/melody-bounce/.gitignore`):

```bash
pnpm publish-song <song>
```

It copies the song into `static/songs/`, which the built site plays from; there, songs can't be added or deleted. To
take one off, delete its folder in `static/songs/` and run `pnpm publish-song` on its own.

What doesn't print well yet: triplets and notes shorter than a sixteenth (the grid is sixteenths), meter changes
mid-song, and some pickups (Schumann's Träumerei comes out a beat off). The score prints what the MIDI plays, so
repeats come out as played (Mutopia's MIDIs skip them). Slurs, dynamics and clef changes aren't printed.

## Video
Rendering a video also needs [Blender](https://www.blender.org) and ffmpeg:

```bash
python3 blender/melody-bounce/make.py blender/melody-bounce/songs/<song>.mid          # 10 s preview
python3 blender/melody-bounce/make.py blender/melody-bounce/songs/<song>.mid --full   # whole song, 1080p
```

How the pipeline works is in [blender/melody-bounce/README.md](blender/melody-bounce/README.md).

## Using it in your own app
The scene is framework-free TypeScript: `createStage(host, time)` in `src/lib/melody/stage.ts` draws into any
element, and `stage.show(song, svg)` plays a song `prepare.py` made (its JSON and engraved SVG). Only the player around
it is Svelte, so wrapping the stage in a React or Vue component is a few lines. Preparing needs Python and LilyPond, so
a site without a server can ship songs prepared ahead of time.

## Made something with it?
I'd love to see it: open an issue or tag [@LetsCodeManh](https://github.com/LetsCodeManh).

## Status
Finished: it does what it set out to do, and no more work is planned. Issues and pull requests are still welcome.

## License
[MIT](LICENSE)
