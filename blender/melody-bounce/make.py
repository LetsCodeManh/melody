# Turns a MIDI file into the melody video without opening Blender: prepare, build and check the scene headless, save
# build/<song>.blend, render, then check the sound lands on the first note and grab stills to look at.
#   python3 blender/melody-bounce/make.py songs/<song>.mid          a 10 s preview at half size
#   python3 blender/melody-bounce/make.py songs/<song>.mid --full   the whole song at 1080p (~50 min/min)
import json, os, re, subprocess, sys, time
import prepare, settings

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender')
PREVIEW = 10            # s
STILLS = (0.2, 0.5, 0.8)  # shares of the video
SYNC = 1.5 / settings.FPS  # s the first sound may be off the first landing


def blender(*args):
    subprocess.run([BLENDER, '-b', '--python-exit-code', '1', *args], check=True)


def build(data, blend):
    """build.py then check.py (which fails if a comet leaves the frame), then save."""
    blender('--addons', 'io_curve_svg',
            '--python', os.path.join(HERE, 'build.py'), '--python', os.path.join(HERE, 'check.py'),
            '--python-expr', f'import bpy; bpy.ops.wm.save_as_mainfile(filepath={blend!r})', '--', data)


def render(blend, video, seconds=None, percent=100):
    setup = (f"import bpy; s = bpy.data.scenes['Bounce']; s.render.resolution_percentage = {percent}; "
             f"s.render.filepath = {video!r}")
    end = ['-e', str(int(seconds * settings.FPS))] if seconds else []
    if os.path.exists(video):
        os.remove(video)
    blender(blend, '-S', 'Bounce', '--python-expr', setup, *end, '-a')
    if not os.path.exists(video):
        raise RuntimeError(f'Blender finished but wrote no {video}')


def first_sound(video):
    log = subprocess.run(['ffmpeg', '-nostdin', '-i', video, '-af', 'silencedetect=n=-50dB:d=0.05', '-f', 'null', '-'],
                         capture_output=True, text=True, check=True).stderr
    found = re.search(r'silence_end: ([\d.]+)', log)
    if not found:
        raise RuntimeError(f'no sound after the lead-in silence in {video}')
    return float(found.group(1))


def stills(video, seconds, folder):
    os.makedirs(folder, exist_ok=True)
    out = []
    for share in STILLS:
        path = os.path.join(folder, f'{share * seconds:05.1f}s.png')
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-ss', f'{share * seconds:.2f}', '-i', video,
                        '-frames:v', '1', path], check=True)
        out.append(path)
    return out


def make(midi_path, full=False):
    stem = os.path.splitext(os.path.basename(midi_path))[0]
    started = time.time()
    data, notes = prepare.prepare(midi_path)
    blend = os.path.join(HERE, 'build', stem + '.blend')
    build(data, blend)
    with open(data) as f:
        song = json.load(f)
    landing = settings.LEAD + min(f[2] for f in song['flights'])
    length = settings.LEAD + song['end'] + settings.TAIL
    video = os.path.join(HERE, 'renders', stem + ('.mp4' if full else '-preview.mp4'))
    seconds = length if full else min(PREVIEW, length)
    render(blend, video, None if full else seconds, 100 if full else 50)
    if landing < seconds:
        heard = first_sound(video)
        if abs(heard - landing) > SYNC:
            raise RuntimeError(f'sound starts at {heard:.3f} s, first comet lands at {landing:.3f} s')
        sync = f'first sound {heard:.3f} s = first landing {landing:.3f} s'
    else:
        sync = f'sync not checked: the first note lands at {landing:.1f} s, after the preview'
    shots = stills(video, seconds, os.path.join(HERE, 'renders', stem + '-stills'))
    print(f'\n{notes} notes, {length:.1f} s song; {sync}\nvideo {video}\nscene {blend}\nstills', *shots,
          f'\ntook {time.time() - started:.0f} s', sep='\n')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--full']
    if len(args) != 1:
        sys.exit('usage: make.py song.mid [--full]')
    make(os.path.abspath(args[0]), '--full' in sys.argv)
