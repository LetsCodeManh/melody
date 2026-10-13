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

    def test_a_file_written_in_two_tracks_prints_each_on_its_own_staff(self):
        # Bach's Prelude in C: the left hand holds C4 and E4 under the right hand's arpeggio, which reaches down to D3
        written = song((0, 8, 60), (1, 7, 64), (2, 1, 67), (3, 1, 72), (4, 1, 76), (5, 1, 50))
        written = written._replace(notes=[n._replace(track=t) for n, t in zip(written.notes, (2, 2, 1, 1, 1, 1))])
        treble, bass = score.chords(written)
        self.assertEqual([c.pitches for c in treble], [[67], [72], [76], [50]])
        self.assertEqual([c.pitches for c in bass], [[60], [64]])

    def test_overlapping_chords_get_their_own_voice(self):
        treble, _ = score.chords(song((0, 8, 62), (0, 2, 69), (2, 2, 70), (8, 4, 62)))
        # the higher voice first: it is printed stems up
        self.assertEqual([[c.pitches[0] for c in v] for v in score.voices(treble)], [[69, 70], [62, 62]])

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


class RestsTest(unittest.TestCase):
    def voices(self, *notes):
        with tempfile.TemporaryDirectory() as folder:
            ly = os.path.join(folder, 'x.ly')
            score.write(song(*notes), ly)
            text = open(ly).read()
        treble = text.split('\\new Staff')[1].split('\\new Voice')[1:]
        return [' '.join(line.strip() for line in v.splitlines()[1:] if line.strip() not in ('}', '>> }')) for v in treble]

    def test_a_voice_rests_visibly_only_for_a_breath_in_its_line_or_where_the_staff_is_silent(self):
        # Chopin's dotted top note over a chord held a quarter, then the chord alone for a half, then a silent beat
        top, chord = self.voices((0, 3, 75), (3, 1, 74), (0, 4, 67), (0, 4, 72), (4, 8, 67), (4, 8, 72))
        self.assertEqual((top, chord), ("<ees''>8. <d''>16 s2 r4", "<g' c''>4 <g' c''>2 s4"))
        # Bach's held E coming in a sixteenth after the half note under it: the breath shows, as in the print
        held, under = self.voices((0, 8, 60), (1, 7, 64))
        self.assertEqual((held, under), ("r16 <e'>8.~ <e'>4 r2", "<c'>2 s2"))


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

    def test_a_length_starting_off_the_beat_is_tied_over_at_the_beat(self):
        # Bach's held E: a sixteenth past the beat, seven sixteenths long
        self.assertEqual(score.lengths(7, 1, 4), ['8.', '4'])
        self.assertEqual(score.lengths(2, 1, 4), ['8'])
        self.assertEqual(score.lengths(9, 3, 6), ['8.', '4.'])  # in 6/8, the beat a dotted quarter

    def test_a_length_over_a_barline_is_split_there_then_by_the_beat(self):
        # Satie's held D: a bar of 3/4 and two beats more prints 2.~2, not 1~4 (which LilyPond splits into 2.~4~4)
        self.assertEqual(score.lengths(20, 0, 4, 12), ['2.', '2'])
        self.assertEqual(score.lengths(6, 10, 4, 12), ['8', '4'])
        self.assertEqual(score.lengths(28, 24, 4, 12), ['2.', '2.', '4'])  # over two barlines
        self.assertEqual(score.lengths(8, -4, 4, 12), ['4', '4'])           # from a one-beat pickup


class PrintedTest(unittest.TestCase):
    def test_a_note_split_at_a_barline_is_struck_on_its_leftmost_head_whatever_order_they_are_printed_in(self):
        # LilyPond links both heads of a note it splits at a barline to the same place, and may print the later first
        head = '<a xlink:href="textedit:///s.ly:{}:3:4"><g transform="translate({}, 2.0)"><path d=""/></g></a>'
        source = score.Source()
        source.heads, source.held = {(5, 3): 0}, {(6, 3): 0}
        with tempfile.TemporaryDirectory() as folder:
            svg = os.path.join(folder, 's.svg')
            with open(svg, 'w') as f:
                f.write(head.format(5, 20.0) + head.format(5, 10.0) + head.format(6, 30.0))
            struck = score.noteheads(svg, source)
            held = score.held_heads(svg, source)
        self.assertEqual([h.x for h in struck], [10.0 + score.HEAD_HALF])
        self.assertEqual([h.x for h in held], [20.0 + score.HEAD_HALF, 30.0 + score.HEAD_HALF])


    def test_a_tie_is_read_as_the_curve_along_the_middle_of_its_crescent(self):
        # as LilyPond prints one: the upper edge left to right, then the lower edge back
        tie = ('<g transform="translate(100.0, 10.0)"><path stroke-width="0.0800" fill="currentColor" '
               'd="M1.0000 0.8000C2.0000 0.2000 3.0000 0.2000 4.0000 0.8000L4.0000 0.8000C3.0000 0.4000 2.0000 0.4000 '
               '1.0000 0.8000z"/></g>')
        with tempfile.TemporaryDirectory() as folder:
            svg = os.path.join(folder, 's.svg')
            with open(svg, 'w') as f:
                f.write('<a xlink:href="textedit:///s.ly:7:9:10">' + tie + '</a>')
            self.assertEqual(score.ties(svg), [((101.0, 10.8), (102.0, 10.3), (103.0, 10.3), (104.0, 10.8))])


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

    def test_ledger_lines_are_drawn_as_staff_lines(self):
        # middle C under the treble staff stands on a ledger line: printed as the staff lines are, a stroke as thick
        with tempfile.TemporaryDirectory() as folder:
            ly = os.path.join(folder, 'ledger.ly')
            score.write(song((0, 4, 60), (4, 4, 67)), ly)
            with open(score.engrave(ly)) as f:
                text = f.read()
        widths = [float(m.group(1)) for m in score.LINE.finditer(text)]
        self.assertEqual(len(widths), 11)  # two staves of five, and the ledger line
        self.assertEqual(set(widths), {0.1})
        self.assertNotIn(score.LEDGERS, text)

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
