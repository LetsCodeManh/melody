import os, shutil, tempfile, unittest
import score
from midi import Note, Song


def song(*notes, key=-2):
    """notes: (tick, ticks, pitch); 4 ticks per quarter, so one tick is a sixteenth."""
    return Song([Note(t / 8, (t + n) / 8, p, 80, t, n) for t, n, p in notes], 4, (4, 4), key)


class ChordsTest(unittest.TestCase):
    def test_splits_hands_at_middle_c_then_groups_chords(self):
        treble, bass = score.chords(song((0, 2, 67), (0, 2, 57), (0, 2, 70), (0, 4, 62)))
        self.assertEqual([(c.start, c.length, c.pitches) for c in treble], [(0, 2, [67, 70]), (0, 4, [62])])
        self.assertEqual([(c.pitches, c.notes) for c in bass], [([57], [1])])

    def test_overlapping_chords_get_their_own_voice(self):
        treble, _ = score.chords(song((0, 8, 62), (0, 2, 69), (2, 2, 70), (8, 4, 62)))
        self.assertEqual([[c.pitches[0] for c in v] for v in score.voices(treble)], [[62, 62], [69, 70]])


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


if __name__ == '__main__':
    unittest.main()
