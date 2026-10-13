import os, shutil, tempfile, unittest
import score
from midi import Note, Song


def song(*notes, key=-2):
    """notes: (tick, ticks, pitch); 4 ticks per quarter, so one tick is a sixteenth."""
    return Song([Note(t / 8, (t + n) / 8, p, 80, t, n) for t, n, p in notes], 4, (4, 4), key)


class ChordsTest(unittest.TestCase):
    def test_splits_hands_at_middle_c_then_groups_chords(self):
        treble, bass = score.chords(song((0, 2, 67), (0, 2, 57), (0, 2, 70), (0, 4, 64)))
        self.assertEqual([(c.start, c.length, c.pitches) for c in treble], [(0, 2, [67, 70]), (0, 4, [64])])
        self.assertEqual([(c.pitches, c.notes) for c in bass], [([57], [1])])

    def test_middle_c_goes_with_the_left_hand_chord_it_is_struck_in(self):
        # A3 and C4 struck together under a held tune, as Saria's Song's accompaniment
        treble, bass = score.chords(song((0, 8, 71), (0, 1, 57), (0, 1, 60), (1, 1, 57), (1, 1, 60)))
        self.assertEqual([c.pitches for c in treble], [[71]])
        self.assertEqual([c.pitches for c in bass], [[57, 60], [57, 60]])

    def test_middle_c_stays_up_as_the_tune_alone_or_out_of_reach(self):
        _, bass = score.chords(song((0, 2, 57), (0, 2, 60),     # nothing above it: the tune
                                    (2, 2, 48), (2, 2, 60), (2, 2, 67),  # an octave over the bass note
                                    (4, 2, 60), (4, 2, 67),               # no bass note struck with it
                                    (6, 2, 57), (6, 2, 64), (6, 2, 72)))  # E4 stays on the treble staff
        self.assertEqual([c.pitches for c in bass], [[57], [48], [57]])

    def test_overlapping_chords_get_their_own_voice(self):
        treble, _ = score.chords(song((0, 8, 62), (0, 2, 69), (2, 2, 70), (8, 4, 62)))
        self.assertEqual([[c.pitches[0] for c in v] for v in score.voices(treble)], [[62, 62], [69, 70]])

    def test_a_staff_needing_more_than_four_voices_prints_each_note_up_to_the_next_onset(self):
        # a sequencer's sustain: chords a beat apart, each held for four and a quarter beats
        held = song(*((t, 17, p) for t in range(0, 40, 4) for p in (65, 69)), (0, 9, 48))
        treble, bass = score.chords(held)
        self.assertEqual({c.length for c in treble[:-1]}, {4})
        self.assertEqual((treble[-1].length, len(score.voices(treble))), (17, 1))  # nothing after the last to stop it
        self.assertEqual([c.length for c in bass], [9])  # alone on its staff, it keeps its length

    def test_four_voices_are_left_as_written(self):
        treble, _ = score.chords(song((0, 16, 60), (0, 12, 64), (0, 8, 67), (0, 4, 72), (4, 4, 74)))
        self.assertEqual(sorted(c.length for c in treble), [4, 4, 8, 12, 16])


class CheckWrittenTest(unittest.TestCase):
    def test_refuses_a_recording_of_someone_playing(self):
        played = Song([Note(i / 8, i / 8 + 1, 60, 80, i * 7 + i % 5, 9) for i in range(40)], 32, (4, 4), None)
        with self.assertRaisesRegex(score.Unreadable, 'recorded from someone playing'):
            score.check_written(played)

    def test_lets_a_written_piece_played_a_little_early_through(self):
        early = Song([Note(i / 8, i / 8 + 1, 60, 80, 32 * i - (6 if i % 3 else 0), 32) for i in range(40)], 128, (4, 4), None)
        score.check_written(early)

    def test_refuses_a_file_without_notes(self):
        with self.assertRaisesRegex(score.Unreadable, 'no notes'):
            score.check_written(Song([], 480, (4, 4), None))


class SignatureTest(unittest.TestCase):
    def test_keeps_the_files_own_key(self):
        self.assertEqual(score.signature(song((0, 4, 66), key=-2)), -2)

    def test_without_one_picks_the_signature_needing_fewest_accidentals(self):
        e_flat = song(*((i, 1, p) for i, p in enumerate((63, 65, 67, 68, 70, 72, 74, 63, 67, 70))), key=None)
        self.assertEqual(score.signature(e_flat), -3)
        self.assertEqual(score.signature(song((0, 4, 60), (4, 4, 65), (8, 4, 69), key=None)), 0)  # C or F: fewer flats


class SpellingTest(unittest.TestCase):
    def test_pitch_names_follow_the_key(self):
        self.assertEqual([score.pitch_name(p, -2) for p in (60, 70, 66, 48, 36, 74)],
                         ["c'", "bes'", "fis'", 'c', 'c,', "d''"])
        self.assertEqual(score.pitch_name(70, 2), "ais'")

    def test_tied_parts_are_mapped_as_held(self):
        treble, _ = score.chords(song((0, 5, 60)))
        src = score.Source()
        src.event('', treble[0]._replace(pitches=["c'"]), 5, '')
        self.assertEqual((src.lines, src.heads, src.held), (["<c'>4~", "<c'>16"], {(1, 1): 0}, {(2, 1): 0}))

    def test_lengths_split_into_tied_values(self):
        self.assertEqual(score.lengths(6), ['4.'])
        self.assertEqual(score.lengths(5), ['4', '16'])
        self.assertEqual(score.lengths(40), ['1.', '1'])


@unittest.skipUnless(shutil.which('lilypond'), 'needs LilyPond')
class EngraveTest(unittest.TestCase):
    def test_every_note_gets_a_head_at_its_place(self):
        s = song((0, 4, 60), (0, 4, 64), (4, 2, 67), (6, 2, 48), (8, 16, 72))
        with tempfile.TemporaryDirectory() as folder:
            ly = os.path.join(folder, 'tiny.ly')
            mapped = score.write(s, ly)
            svg = score.engrave(ly)
            heads = score.noteheads(svg, mapped)
            held = score.held_heads(svg, mapped)
        by_note = {h.note: h for h in heads}
        self.assertEqual(sorted(by_note), [0, 1, 2, 3, 4])
        self.assertAlmostEqual(by_note[0].y - by_note[1].y, 1.0)  # C4 to E4: a staff space apart
        self.assertLess(by_note[0].x, by_note[2].x)
        self.assertLess(by_note[2].x, by_note[4].x)
        # the last note lasts a bar and a half from beat 3: tied over the barline, it prints more heads, all further on
        self.assertTrue(held)
        self.assertEqual({h.note for h in held}, {4})
        self.assertTrue(all(h.x > by_note[4].x for h in held))

    def test_a_waltz_with_a_pickup_is_barred_in_three_after_it(self):
        # a quarter before the first bar, then oom-pah-pah; the last note is held from beat two over the barline
        waltz = [(4 + 12 * b + t, 4, p) for b in range(5) for t, p in ((0, 48), (4, 64), (8, 64))]
        s = song((0, 4, 67), *waltz, (64, 4, 48), (68, 12, 72))
        with tempfile.TemporaryDirectory() as folder:
            ly = os.path.join(folder, 'waltz.ly')
            mapped = score.write(s, ly)
            with open(ly) as f:
                text = f.read()
            svg = score.engrave(ly)
            heads = score.noteheads(svg, mapped)
            held = score.held_heads(svg, mapped)
        self.assertIn('\\time 3/4 \\partial 16*4', text)
        self.assertEqual(len(heads), len(s.notes))
        self.assertEqual({h.note for h in held}, {len(s.notes) - 1})  # only the last crosses a barline


if __name__ == '__main__':
    unittest.main()
