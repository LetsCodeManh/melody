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

One song ships as a demo: Bach's Prelude No. 1 in C (BWV 846), public domain, from the
[Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=5). Your own MIDIs stay out of git: most songs
are under copyright. Mutopia has many more free piano pieces.

## Put it online
A deployed site (Vercel, Netlify…) can't prepare songs: that takes Python and LilyPond. Prepare them on your machine
and publish the ones the site should play, then commit and push:

```bash
pnpm publish-song bach-prelude-in-c
```

It copies the song into `static/songs/`, which the built site plays from; there, songs can't be added or deleted. To
take one off, delete its folder in `static/songs/` and run `pnpm publish-song` on its own.

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

## License
[MIT](LICENSE)
