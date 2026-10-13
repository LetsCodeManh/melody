import unittest
import flight, score
from midi import Note, Song

# Two treble chords then one note; one bass note. 4 ticks per quarter, 0.5 s per quarter.
NOTES = [Note(0.0, 0.5, 67, 80, 0, 4), Note(0.0, 0.5, 71, 80, 0, 4), Note(0.0, 2.0, 43, 80, 0, 16),
         Note(0.5, 1.0, 69, 80, 4, 4), Note(0.5, 1.0, 72, 80, 4, 4), Note(0.5, 1.0, 76, 80, 4, 4),
         Note(2.0, 2.5, 74, 80, 16, 4)]
SONG = Song(NOTES, 4, (4, 4), 0)
HEADS = {i: (float(i), float(n.pitch % 12)) for i, n in enumerate(NOTES)}


class FlightsTest(unittest.TestCase):
    def setUp(self):
        self.flights = {f.note: f for f in flight.flights(SONG, score.chords(SONG), HEADS)}

    def test_one_flight_per_note_landing_on_its_onset(self):
        self.assertEqual(sorted(self.flights), list(range(len(NOTES))))
        for n, f in self.flights.items():
            self.assertEqual((f.land, f.target), (NOTES[n].start, HEADS[n]))

    def test_chord_notes_come_from_the_previous_chord_by_pitch_rank(self):
        # chord of 2 (67, 71) to chord of 3 (69, 72, 76): low from low, middle and top from the top
        self.assertEqual([self.flights[n].origin for n in (3, 4, 5)], [HEADS[0], HEADS[1], HEADS[1]])

    def test_long_waits_launch_late_and_first_notes_fly_in(self):
        self.assertEqual(self.flights[6].launch, 2.0 - flight.MAX_FLIGHT)
        self.assertAlmostEqual(self.flights[3].launch, 0.05)
        self.assertNotIn(self.flights[2].origin, HEADS.values())

    def test_after_a_long_rest_the_comet_flies_in_instead_of_across_the_page(self):
        far = {**HEADS, 6: (4.0 + flight.FARTHEST + 1, HEADS[6][1])}
        f = {f.note: f for f in flight.flights(SONG, score.chords(SONG), far)}[6]
        self.assertEqual(f.origin, (far[6][0] + flight.ENTRY[0], far[6][1] + flight.ENTRY[1]))
        self.assertEqual(f.launch, 2.0 - flight.MAX_FLIGHT)

    def test_held_heads_are_flown_to_along_the_tie_unless_reached_at_once(self):
        # note 2 (bass, 0-2 s) rings on to a head reached as it's struck, then one at 1.5 s, then one right after
        held = [(2, 1.52, 9.0, 1.0), (2, 1.5, 8.0, 1.0), (2, 0.0, 2.5, 1.0)]
        flown, still = flight.ties(list(self.flights.values()), held)
        self.assertEqual(flown, [flight.Flight(2, 1.5 - flight.MAX_FLIGHT, 1.5, (2.5, 1.0), (8.0, 1.0))])
        self.assertEqual(still, [(2, 0.0, 2.5, 1.0), (2, 1.52, 9.0, 1.0)])

    def test_arc_starts_and_ends_on_the_page(self):
        f = self.flights[3]
        self.assertEqual(flight.arc(f, 0), (*f.origin, 0))
        self.assertEqual(flight.arc(f, 1), (*f.target, 0))
        self.assertGreater(flight.arc(f, 0.5)[2], 0)


class FramingTest(unittest.TestCase):
    def test_spans_cover_comets_in_the_air_and_hold_through_gaps(self):
        fs = [flight.Flight(0, 0.0, 1.0, (0.0, 0), (4.0, 0)), flight.Flight(1, 0.5, 1.5, (2.0, 0), (9.0, 0))]
        self.assertEqual(flight.spans(fs, [0.2, 0.7, 1.4, 5.0], 0.1), [(0.0, 4.0), (0.0, 9.0), (2.0, 9.0), (2.0, 9.0)])

    def test_framing_keeps_every_comet_in_shot(self):
        fs = [flight.Flight(0, 0.0, 1.0, (0.0, 0), (4.0, 0)), flight.Flight(1, 2.0, 3.0, (4.0, 0), (60.0, 0))]
        times = [i / 10 for i in range(40)]
        centre, back = flight.framing(fs, times, shot=20.0, middle=1.0, margin=2.0, linger=0.2, sigma=5.0,
                                      camera=(-20.0, -22.0, 6.0), view=0.36, look_y=0.0)
        for (lo, hi), c, b in zip(flight.spans(fs, times, 0.2), centre, back):
            half = 20.0 * b / 2
            self.assertLessEqual(c + 1.0 - half, lo - 2.0 + 1e-9)
            self.assertGreaterEqual(c + 1.0 + half, hi + 2.0 - 1e-9)

    def test_framing_keeps_every_comet_in_shot_even_near_the_lens(self):
        # the last comet, long enough in the air for the camera to settle, lands far below the staves: nearer the
        # camera, where the frame is narrowest
        fs = [flight.Flight(0, 0.0, 1.0, (0.0, -10.0), (4.0, -22.0)),
              flight.Flight(1, 2.0, 3.0, (4.0, -22.0), (60.0, -10.0)),
              flight.Flight(2, 6.0, 9.0, (60.0, -10.0), (72.0, -36.0))]
        times = [i / 10 for i in range(100)]
        camera, view = (-20.0, -22.0, 6.0), 0.36
        centre, back = flight.framing(fs, times, shot=19.0, middle=1.75, margin=2.0, linger=0.2, sigma=5.0,
                                      camera=camera, view=view, look_y=-16.5)
        for t, c, b in zip(times, centre, back):
            for f in fs:
                if f.launch <= t <= f.land + 0.2:
                    for x, y in (f.origin, f.target):
                        for side in (-2.0, 2.0):
                            # the point seen from the camera: across the frame over depth along its view
                            d = (x + side - c, y + 16.5, 0.0)
                            o = [a * b for a in camera]
                            rel = [p - q for p, q in zip(d, o)]
                            depth = -sum(r * a for r, a in zip(rel, camera)) / sum(a * a for a in camera) ** 0.5
                            across = (rel[0] * 22.0 - rel[1] * 20.0) / (22.0 ** 2 + 20.0 ** 2) ** 0.5
                            self.assertLessEqual(abs(across) / depth, view + 1e-9, (t, x, y))

    def test_a_point_nearer_the_lens_needs_the_camera_further_back(self):
        camera = (-20.0, -22.0, 6.0)
        self.assertGreater(flight.pull_back(12.0, -15.0, camera, 0.36), flight.pull_back(12.0, -5.0, camera, 0.36))
        # the nearest shot shows the bass staff's row out to about 11.5 right of the point looked at
        self.assertAlmostEqual(flight.pull_back(11.5, -5.5, camera, 0.36), 1.0, places=2)

    def test_reached_maps_page_x_to_time_between_landings(self):
        fs = [flight.Flight(0, 0.0, 1.0, (0.0, 0), (4.0, 0)), flight.Flight(1, 1.0, 3.0, (4.0, 0), (8.0, 0))]
        self.assertEqual(flight.reached(fs, [2.0, 4.0, 6.0, 20.0]), [1.0, 1.0, 2.0, 3.0])

    def test_dilate_then_smooth_stays_above_a_spike(self):
        need = [0.0] * 20 + [10.0] + [0.0] * 20
        smoothed = flight.smooth(flight.dilate(need, 6), 2.0)
        self.assertGreaterEqual(smoothed[20], 10.0 - 1e-9)
        self.assertAlmostEqual(sum(flight.smooth([3.0] * 9, 2.0)) / 9, 3.0)


if __name__ == '__main__':
    unittest.main()
