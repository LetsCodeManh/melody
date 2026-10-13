import unittest
import meter
from midi import Note, Song


def song(*notes, time=(4, 4)):
    """notes: (tick, ticks, pitch); 4 ticks per quarter, so one tick is a sixteenth."""
    return Song([Note(t / 8, (t + n) / 8, p, 80, t, n) for t, n, p in notes], 4, time, None)


def bars(count, bar, pattern, at=0):
    """pattern: (tick in the bar, ticks, pitch), repeated count bars from tick at."""
    return [(at + b * bar + t, n, p) for b in range(count) for t, n, p in pattern]


WALTZ = ((0, 4, 48), (4, 4, 64), (4, 4, 67), (8, 4, 64), (8, 4, 67), (0, 8, 72), (8, 4, 74))
SIX_EIGHT = ((0, 6, 45), (6, 6, 52), (0, 2, 69), (2, 2, 72), (4, 2, 76), (6, 2, 72), (8, 2, 76), (10, 2, 81))
FOUR = ((0, 8, 48), (8, 8, 55), (4, 4, 64), (4, 4, 67), (12, 4, 64), (12, 4, 67), (0, 4, 72), (4, 4, 74),
        (8, 8, 76))


class MeterTest(unittest.TestCase):
    def test_a_waltz_filed_as_four_four_is_barred_in_three(self):
        self.assertEqual(meter.find(song(*bars(8, 12, WALTZ)), 4), (3, 4, 0))

    def test_a_song_in_four_stays_in_four(self):
        self.assertEqual(meter.find(song(*bars(8, 16, FOUR)), 4), (4, 4, 0))

    def test_no_strong_beats_at_all_stays_in_four(self):
        self.assertEqual(meter.find(song(*((t, 4, 64) for t in range(0, 96, 4))), 4), (4, 4, 0))

    def test_beats_in_threes_of_eighths_are_six_eight(self):
        self.assertEqual(meter.find(song(*bars(8, 12, SIX_EIGHT)), 4), (6, 8, 0))

    def test_six_eight_with_a_stronger_downbeat_every_other_bar_is_twelve_eight(self):
        downbeat = ((0, 24, 33), (0, 24, 40), (0, 12, 57))  # a deep chord held through the bar
        self.assertEqual(meter.find(song(*bars(8, 12, SIX_EIGHT), *bars(4, 24, downbeat)), 4), (12, 8, 0))

    def test_a_tune_starting_before_beat_one_gets_a_pickup(self):
        pickup = [(0, 4, 67)]  # a quarter before the first full bar
        self.assertEqual(meter.find(song(*pickup, *bars(8, 12, WALTZ, at=4)), 4), (3, 4, 4))

    def test_a_fragment_too_short_to_tell_keeps_the_files_meter_without_a_pickup(self):
        self.assertEqual(meter.find(song((0, 4, 60), (4, 2, 67), (6, 2, 48), (8, 16, 72)), 4), (4, 4, 0))

    def test_the_files_own_meter_is_kept_and_only_the_pickup_found(self):
        self.assertEqual(meter.find(song(*bars(8, 16, FOUR), time=(3, 4)), 4)[:2], (3, 4))
        self.assertEqual(meter.find(song((0, 4, 67), *bars(8, 12, WALTZ, at=4), time=(3, 4)), 4), (3, 4, 4))


if __name__ == '__main__':
    unittest.main()
