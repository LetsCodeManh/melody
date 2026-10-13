# The look and timing of the Bounce scene, shared by build.py and check.py. Distances in staff spaces unless noted.
import sys

HERE = '/Users/manh/Developer/personal-os/visual/blender/melody-bounce/'
DEFAULT_SONG = HERE + 'build/korobeiniki-piano.json'
FPS = 60
SAMPLES = 16                # EEVEE samples per frame: looks the same as 64 here at a third of the time
LEAD, TAIL = 1.0, 2.0       # s before the first note and after the last
SPACE = 0.05                # metres per staff space: a 1-minute score is ~30 m long
INK = 0.0015                # m: how far the print stands off the paper
STAFF_MID = -16.5           # page y between the two staves
CAMERA = (-20.0, -22.0, 6.0)  # from the point it looks at, when nothing needs a wider shot
LAMP = (-3.0, 0.0, 5.0)     # from that point
SHOT = 19.0                 # width both staves show at the camera's nearest (measured); wider spans pull it back
SHOT_MIDDLE = 1.75          # the middle of that view sits this far right of the point looked at
MARGIN = 2.0                # kept clear around the comets
LINGER = 0.4                # s a landed comet still counts as on screen
SMOOTH = 1.0                # s: sigma of the camera's Gaussian smoothing


def prepared():
    """The song's prepared JSON: the argument after '--' when Blender runs a script from the command line."""
    return sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else DEFAULT_SONG
