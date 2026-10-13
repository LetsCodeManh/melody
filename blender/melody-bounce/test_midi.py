# python3 -m unittest discover -s blender/melody-bounce
import os, struct, unittest
import midi

HERE = os.path.dirname(__file__)


def track(*events):
    body = b''.join(events) + b'\x00\xff\x2f\x00'
    return b'MTrk' + struct.pack('>I', len(body)) + body


def smf(*tracks, division=480):
    return b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), division) + b''.join(tracks)


TEMPO_120 = b'\x00\xff\x51\x03\x07\xa1\x20'  # 500000 us per beat
TEMPO_60_AFTER_ONE_BEAT = b'\x83\x60\xff\x51\x03\x0f\x42\x40'  # 480 ticks later: 1000000 us per beat


class ParseTest(unittest.TestCase):
    def test_note_times_follow_tempo_changes_on_another_track(self):
        notes = midi.parse(smf(
            track(TEMPO_120, TEMPO_60_AFTER_ONE_BEAT),
            track(b'\x00\x90\x3c\x64', b'\x83\x60\x80\x3c\x00',   # C4: beat 0-1
                  b'\x00\x90\x3e\x64', b'\x83\x60\x80\x3e\x00')))  # D4: beat 1-2, now at 60 bpm
        self.assertEqual([(n.pitch, round(n.start, 3), round(n.end, 3)) for n in notes],
                         [(60, 0.0, 0.5), (62, 0.5, 1.5)])

    def test_running_status_and_velocity_zero_note_off(self):
        notes = midi.parse(smf(track(b'\x00\x90\x3c\x64', b'\x83\x60\x3c\x00', b'\x00\x40\x50', b'\x83\x60\x40\x00')))
        self.assertEqual([(n.pitch, n.velocity, n.end) for n in notes], [(60, 100, 0.5), (64, 80, 1.0)])

    def test_keeps_ticks_time_and_key_signature(self):
        song = midi.parse_song(smf(track(b'\x00\xff\x58\x04\x03\x02\x18\x08', b'\x00\xff\x59\x02\xfe\x00',
                                         b'\x00\x90\x3c\x64', b'\x81\x70\x80\x3c\x00')))
        self.assertEqual((song.time, song.key, song.division), ((3, 4), -2, 480))
        self.assertEqual((song.notes[0].tick, song.notes[0].ticks), (0, 240))

    def test_a_file_without_a_key_signature_says_so(self):
        song = midi.parse_song(smf(track(b'\x00\x90\x3c\x64', b'\x83\x60\x80\x3c\x00')))
        self.assertEqual((song.time, song.key), ((4, 4), None))

    def test_skips_the_drum_channel(self):
        notes = midi.parse(smf(track(b'\x00\x99\x24\x64', b'\x00\x90\x3c\x64', b'\x83\x60\x89\x24\x00',
                                     b'\x00\x80\x3c\x00')))
        self.assertEqual([n.pitch for n in notes], [60])

    def test_rejects_non_midi(self):
        with self.assertRaises(ValueError):
            midi.parse(b'RIFF' + b'\x00' * 20)

    def test_reads_the_songs_here(self):
        # the songs are private and kept out of git, so this checks whichever are on this machine
        folder = os.path.join(HERE, 'songs')
        names = sorted(f for f in os.listdir(folder) if f.endswith('.mid')) if os.path.isdir(folder) else []
        if not names:
            self.skipTest('no songs in songs/')
        for name in names:
            with self.subTest(name):
                notes = midi.read(os.path.join(folder, name))
                self.assertGreater(len(notes), 30)
                self.assertEqual(notes, sorted(notes, key=lambda n: (n.start, -n.pitch)))
                self.assertTrue(all(n.end > n.start for n in notes))


class MelodyTest(unittest.TestCase):
    def test_keeps_the_highest_note_of_each_chord(self):
        N = midi.Note
        notes = [N(0.0, 1, 72, 90), N(0.0, 1, 60, 90), N(0.005, 1, 76, 90), N(0.5, 1, 64, 90)]
        self.assertEqual([n.pitch for n in midi.melody(notes)], [76, 64])


if __name__ == '__main__':
    unittest.main()
