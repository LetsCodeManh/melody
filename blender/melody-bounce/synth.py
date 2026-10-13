# Renders notes to a mono 16-bit WAV with a soft mallet tone, so the audio lines up with the ball by construction.
# Standard library only. Use your own recording instead by passing it as AUDIO in build.py.
import array, math, wave

RATE = 44100
DECAY = 6.0     # 1/s: how fast each strike fades
RING = 0.6      # s a note sounds past its end
PARTIALS = ((1, 1.0), (2, 0.25), (4, 0.08))  # (multiple of the fundamental, amplitude)


def frequency(pitch):
    return 440.0 * 2 ** ((pitch - 69) / 12)


def render(notes, path):
    length = int((max(n.end for n in notes) + RING) * RATE) + 1
    mix = array.array('f', bytes(4 * length))
    for n in notes:
        start, count = int(n.start * RATE), int((n.end - n.start + RING) * RATE)
        loud, f = n.velocity / 127, frequency(n.pitch)
        steps = [2 * math.pi * f * k / RATE for k, _ in PARTIALS]
        for s in range(min(count, length - start)):
            t = s / RATE
            env = loud * math.exp(-DECAY * t) * min(t * 400, 1.0)  # 2.5 ms attack: no click
            mix[start + s] += env * sum(a * math.sin(w * s) for w, (_, a) in zip(steps, PARTIALS))
    peak = max(max(mix), -min(mix)) or 1.0
    pcm = array.array('h', (int(v / peak * 0.8 * 32767) for v in mix))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    return path
