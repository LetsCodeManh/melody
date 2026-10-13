# Renders the Bounce scene to an mp4 with sound without blocking the MCP call: the render runs from a timer;
# poll for <path>.done to know it finished (the file holds the render time in seconds).
import bpy, os, time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'renders')


def kick(name='test', seconds=10, percent=50):
    """seconds=None renders the whole song."""
    sc = bpy.data.scenes['Bounce']
    os.makedirs(ROOT, exist_ok=True)
    path = os.path.join(ROOT, name + '.mp4')
    for p in (path, path + '.done'):
        if os.path.exists(p):
            os.remove(p)
    end = sc.frame_end
    if seconds:
        sc.frame_end = min(end, sc.frame_start + int(seconds * sc.render.fps) - 1)
    sc.render.resolution_percentage = percent
    sc.render.filepath = path

    def run():
        t = time.time()
        try:
            with bpy.context.temp_override(scene=sc):
                bpy.ops.render.render(animation=True, scene=sc.name)
        finally:
            sc.frame_end = end
        with open(path + '.done', 'w') as f:
            f.write(f'{time.time() - t:.1f}')
        return None

    bpy.app.timers.register(run, first_interval=0.2)
    return path
