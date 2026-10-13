# Engraves a song as a paged PDF, to check against its source's own print before preparing it: if the PDF is wrong,
# everything built on it is. Only the score, no flights or audio; a few seconds.
#   python3 blender/melody-bounce/engrave.py blender/melody-bounce/songs/<song>.mid      writes build/<song>.pdf
import os, subprocess, sys
import midi, score

HERE = os.path.dirname(os.path.abspath(__file__))


def engrave(path):
    """The song's paged PDF in build/; returns its path."""
    stem = os.path.splitext(os.path.basename(path))[0]
    folder = os.path.join(HERE, 'build')
    os.makedirs(folder, exist_ok=True)
    song = midi.load(path)
    score.check_written(song)
    score.write(song, os.path.join(folder, stem + '.paged.ly'), paged=True)
    run = subprocess.run(['lilypond', '--pdf', '-o', stem, stem + '.paged.ly'], cwd=folder, capture_output=True,
                         text=True)
    if run.returncode:
        raise RuntimeError(run.stderr[-2000:])
    return os.path.join(folder, stem + '.pdf')


if __name__ == '__main__':
    for path in sys.argv[1:]:
        print(engrave(path))
