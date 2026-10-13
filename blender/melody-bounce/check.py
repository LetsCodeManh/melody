# Checks a built Bounce scene: every comet in the air and ball rolling along a tie (and each landing spot) is inside the
# camera's frame, and the camera moves smoothly; fails if one leaves the frame. Run after build.py in the same Blender:
#   exec(open('/Users/manh/Developer/personal-os/visual/blender/melody-bounce/check.py').read())
import bpy, json, sys
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = '/Users/manh/Developer/personal-os/visual/blender/melody-bounce/'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import flight, settings as cfg  # noqa: E402

EVERY = 3   # frames


def check(sc, flights, glides):
    cam, outside, checked, worst = sc.camera, 0, 0, 0.0
    for f in range(sc.frame_start, sc.frame_end + 1, EVERY):
        sc.frame_set(f)
        t = (f - sc.frame_start) / cfg.FPS - cfg.LEAD
        points = []
        for fl in flights:
            if not fl.launch <= t <= fl.land + cfg.LINGER:
                continue
            u = min(max((t - fl.launch) / (fl.land - fl.launch), 0.0), 1.0)
            points.extend((flight.arc(fl, u), (*fl.target, 0.0)))
        for g in glides:
            if g.start <= t <= g.end + cfg.LINGER:
                points.append((*flight.bezier(g.curve, min((t - g.start) / (g.end - g.start), 1.0)), 0.0))
        for x, y, h in points:
            p = world_to_camera_view(sc, cam, Vector((x * cfg.SPACE, y * cfg.SPACE, cfg.INK + h * cfg.SPACE)))
            checked += 1
            over = max(-p.x, p.x - 1, -p.y, p.y - 1, 0.0)
            if over > 0:
                outside, worst = outside + 1, max(worst, over)
    fc = cam.animation_data.action.fcurve_ensure_for_datablock(cam, 'location', index=0)
    xs = [fc.evaluate(f) for f in range(sc.frame_start, sc.frame_end + 1)]
    speed = [b - a for a, b in zip(xs, xs[1:])]
    jerk = max(abs(b - a) for a, b in zip(speed, speed[1:]))
    return {'comet points': checked, 'outside frame': outside, 'worst overshoot': round(worst, 3),
            'max camera step m/frame': round(max(map(abs, speed)), 4), 'max change in step': round(jerk, 5)}


with open(cfg.prepared()) as f:
    _data = json.load(f)
_flights = [flight.Flight(n, a, b, (ox, oy), (tx, ty)) for n, a, b, ox, oy, tx, ty in _data['flights']]
_glides = [flight.Glide(n, a, b, tuple(zip(c[::2], c[1::2]))) for n, a, b, *c in _data['ties']]
result = check(bpy.data.scenes['Bounce'], _flights, _glides)
print(result)
if result['outside frame']:
    raise RuntimeError(f"{result['outside frame']} comet points leave the frame")
