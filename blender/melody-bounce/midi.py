# Reads a Standard MIDI File into notes with times in seconds. Standard library only, so it runs in Blender's Python.
# Handles format 0 and 1, tempo changes on any track, running status, and note-on with velocity 0 as note-off.
# Drums are left out.
from collections import namedtuple
import struct

Note = namedtuple('Note', 'start end pitch velocity tick ticks', defaults=(0, 0))  # tick, ticks: start and length
Song = namedtuple('Song', 'notes division time key')  # time: (beats, beat unit); key: sharps (+) or flats (-), None if the file has none

CHORD_WINDOW = 0.02  # seconds: onsets closer than this count as one chord
DRUMS = 9            # General MIDI channel 10: percussion, which has no pitch to engrave


def read(path):
    return load(path).notes


def load(path):
    with open(path, 'rb') as f:
        return parse_song(f.read())


def parse(data):
    return parse_song(data).notes


def parse_song(data):
    chunk, size, fmt, ntracks, division = struct.unpack('>4sIHHH', data[:14])
    if chunk != b'MThd':
        raise ValueError('not a MIDI file')
    if division & 0x8000:
        raise ValueError('SMPTE time division is not supported')
    pos, events = 8 + size, []  # events: (tick, order, kind, a, b, c)
    for _ in range(ntracks):
        chunk, size = struct.unpack('>4sI', data[pos:pos + 8])
        if chunk == b'MTrk':
            events += _track(data[pos + 8:pos + 8 + size])
        pos += 8 + size
    events.sort(key=lambda e: (e[0], e[1]))
    time = next(((a, b) for _, _, kind, a, b, _ in events if kind == 'time'), (4, 4))
    key = next((a for _, _, kind, a, _, _ in events if kind == 'key'), None)
    return Song(_notes(events, division), division, time, key)


def _varlen(data, i):
    value = 0
    while True:
        byte = data[i]
        i += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, i


def _track(data):
    i, tick, status, out = 0, 0, None, []
    while i < len(data):
        delta, i = _varlen(data, i)
        tick += delta
        if data[i] & 0x80:
            status = data[i]
            i += 1
        elif status is None:
            raise ValueError('running status before any status byte')
        if status == 0xFF:
            kind = data[i]
            length, i = _varlen(data, i + 1)
            if kind == 0x51:
                out.append((tick, 0, 'tempo', int.from_bytes(data[i:i + 3], 'big'), 0, 0))
            elif kind == 0x58:
                out.append((tick, 0, 'time', data[i], 2 ** data[i + 1], 0))
            elif kind == 0x59:
                out.append((tick, 0, 'key', int.from_bytes(data[i:i + 1], 'big', signed=True), 0, 0))
            i += length
            status = None
        elif status in (0xF0, 0xF7):
            length, i = _varlen(data, i)
            i += length
            status = None
        else:
            kind, channel = status & 0xF0, status & 0x0F
            if kind in (0xC0, 0xD0):
                i += 1
                continue
            a, b = data[i], data[i + 1]
            i += 2
            if channel == DRUMS:
                continue
            if kind == 0x90 and b > 0:
                out.append((tick, 2, 'on', channel, a, b))
            elif kind == 0x80 or kind == 0x90:
                out.append((tick, 1, 'off', channel, a, 0))  # offs sort before ons on the same tick
    return out


def _notes(events, division):
    tempo, last_tick, seconds = 500000, 0, 0.0
    held, notes = {}, []
    for tick, _, kind, a, b, c in events:
        seconds += (tick - last_tick) * tempo / 1e6 / division
        last_tick = tick
        if kind == 'tempo':
            tempo = a
        elif kind == 'on':
            held.setdefault((a, b), []).append((seconds, c, tick))
        elif kind == 'off' and held.get((a, b)):
            start, velocity, start_tick = held[(a, b)].pop(0)
            notes.append(Note(start, seconds, b, velocity, start_tick, tick - start_tick))
    notes.sort(key=lambda n: (n.start, -n.pitch))
    return notes


def melody(notes):
    """One note per onset: the highest of each chord, which is usually the tune."""
    out = []
    for n in notes:
        if out and n.start - out[-1].start < CHORD_WINDOW:
            if n.pitch > out[-1].pitch:
                out[-1] = n
            continue
        out.append(n)
    return out
