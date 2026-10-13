# Builds the melody visualisation in its own scene ('Bounce'): the engraved score on paper, a comet per note landing
# on its head, a warm light and a low camera following the music, and the song as the scene's sound.
# Run prepare.py on the MIDI first. Inside Blender (builds settings.DEFAULT_SONG):
#   exec(open('/Users/manh/Developer/personal-os/visual/blender/melody-bounce/build.py').read())
# or from the command line, for any prepared song: see make.py.
import bpy, bmesh, importlib, json, math, sys
from mathutils import Matrix, Vector

HERE = '/Users/manh/Developer/personal-os/visual/blender/melody-bounce/'
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import flight, lights, score, settings
for m in (flight, lights, score, settings):
    importlib.reload(m)
from settings import FPS, SAMPLES, LEAD, SPACE, INK, STAFF_LINES, STAFF_MID

CAMERA, LAMP = Vector(settings.CAMERA), Vector(settings.LAMP)


def fresh_scene(name):
    win = bpy.context.window or next(iter(bpy.context.window_manager.windows), None)  # none when headless
    old = bpy.data.scenes.get(name)
    if old:
        if win and win.scene == old:
            win.scene = next(s for s in bpy.data.scenes if s != old)
        for ob in list(old.collection.all_objects):
            bpy.data.objects.remove(ob)
        for c in list(old.collection.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.scenes.remove(old)
    bpy.data.orphans_purge(do_recursive=True)
    sc = bpy.data.scenes.new(name)
    if win:
        win.scene = sc
    return sc


def bake(owner, path, index, frames, values):
    """Many keyframes at once on any ID (object, curve); keyframe_insert per frame is slow for a whole song."""
    if not owner.animation_data or not owner.animation_data.action:
        owner.animation_data_create().action = bpy.data.actions.new(owner.name)
    fc = owner.animation_data.action.fcurve_ensure_for_datablock(owner, path, index=index)
    fc.keyframe_points.clear()
    fc.keyframe_points.add(len(frames))
    fc.keyframe_points.foreach_set('co', [c for fv in zip(frames, values) for c in fv])
    linear = bpy.types.Keyframe.bl_rna.properties['interpolation'].enum_items['LINEAR'].value
    fc.keyframe_points.foreach_set('interpolation', [linear] * len(frames))
    fc.update()


def principled(name, colour, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Roughness'].default_value = roughness
    return mat, bsdf


def score_mesh(sc, svg, page):
    """The importer's curves, filled and merged into two meshes in page units scaled to SPACE (y up, origin at the
    SVG's top-left): the print standing INK off the paper, glossy, and the staff lines under it, lower and matte."""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=svg)
    curves = [o for o in bpy.data.objects if o not in before]
    k = SPACE / (page['width'] / page['box'])
    to_page = Matrix.Translation((0, -page['height'] * k, 0)) @ Matrix.Scale(k, 4)
    deps = bpy.context.evaluated_depsgraph_get()
    ink, staff = bmesh.new(), bmesh.new()
    for ob in curves:
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
        me.transform(to_page @ ob.matrix_world)
        (staff if ob.name.startswith(score.STAFF_LINE) else ink).from_mesh(me)
        bpy.data.meshes.remove(me)
    imported = {c for ob in curves for c in ob.users_collection if c != sc.collection}
    for ob in curves:
        data = ob.data
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(data)
    for c in imported:
        bpy.data.collections.remove(c)
    inked(sc, 'Staff', staff, INK * STAFF_LINES, principled('Staff lines', (0.02, 0.02, 0.02, 1), 0.6)[0])
    return inked(sc, 'Score', ink, INK, principled('Ink', (0.008, 0.008, 0.008, 1), 0.3)[0])


def inked(sc, name, bm, height, mat):
    """The faces in bm as an object of raised ink, height off the paper; frees bm."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    sc.collection.objects.link(ob)
    solid = ob.modifiers.new('Ink', 'SOLIDIFY')
    solid.thickness, solid.offset = height, 1.0
    mesh.materials.append(mat)
    return ob


def paper(sc, length):
    mesh = bpy.data.meshes.new('Paper')
    x0, x1, y0, y1 = -3.0, length + 3.0, -4.0, 12.0
    mesh.from_pydata([(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('Paper', mesh)
    sc.collection.objects.link(ob)
    mat, bsdf = principled('Paper', (0.78, 0.75, 0.70, 1), 0.65)
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 900.0
    tex.inputs['Detail'].default_value = 8.0
    coords = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(coords.outputs['Object'], tex.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.25
    bump.inputs['Distance'].default_value = 0.0005
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mesh.materials.append(mat)


def follow(sc, frames, name, centre, offset, back=None, data=None):
    """An object riding along with the shot: offset (staff spaces) from the point looked at, scaled by back."""
    ob = bpy.data.objects.new(name, data)
    sc.collection.objects.link(ob)
    back = back or [1.0] * len(frames)
    for axis, values in enumerate(([(x + offset.x * b) * SPACE for x, b in zip(centre, back)],
                                   [(STAFF_MID + offset.y * b) * SPACE for b in back],
                                   [offset.z * b * SPACE for b in back])):
        bake(ob, 'location', axis, frames, values)
    return ob


def camera_and_light(sc, frames, camera):
    """camera: prepare.py's framing, one sample per frame."""
    centre, back = camera['centre'], camera['back']
    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = 50
    cam = follow(sc, frames, 'Camera', centre, CAMERA, back, cam_data)
    look = -CAMERA
    cam.rotation_euler = (math.atan2(math.hypot(look.x, look.y), -look.z), 0, math.atan2(look.y, look.x) - math.pi / 2)
    focus = follow(sc, frames, 'Focus', centre, Vector())
    cam_data.dof.use_dof, cam_data.dof.focus_object, cam_data.dof.aperture_fstop = True, focus, 1.2
    sc.camera = cam
    lamp = bpy.data.lights.new('Glow', 'POINT')
    lamp.color, lamp.energy, lamp.shadow_soft_size = lights.COMET_COLOUR[:3], 6.0, 0.05
    follow(sc, frames, 'Glow', centre, LAMP, data=lamp)
    world = bpy.data.worlds.new('Bounce')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value, bg.inputs['Strength'].default_value = (0.6, 0.62, 0.7, 1), 0.02
    sc.world = world


def bloom(sc):
    ng = bpy.data.node_groups.new('Bloom', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    layers = ng.nodes.new('CompositorNodeRLayers')
    glare = ng.nodes.new('CompositorNodeGlare')
    out = ng.nodes.new('NodeGroupOutput')
    glare.inputs['Type'].default_value = 'Bloom'
    glare.inputs['Threshold'].default_value = 1.0
    glare.inputs['Strength'].default_value = 0.6
    glare.inputs['Size'].default_value = 0.6
    ng.links.new(layers.outputs['Image'], glare.inputs['Image'])
    ng.links.new(glare.outputs['Image'], out.inputs[0])
    sc.compositing_node_group = ng


def sound_and_output(sc, wav):
    sc.sequence_editor_create()
    sc.sequence_editor.strips.new_sound('Song', wav, channel=1, frame_start=sc.frame_start + int(LEAD * FPS))
    r = sc.render
    r.fps, r.resolution_x, r.resolution_y = FPS, 1920, 1080
    sc.eevee.taa_render_samples = SAMPLES
    r.image_settings.media_type = 'VIDEO'
    r.image_settings.file_format = 'FFMPEG'
    r.ffmpeg.format, r.ffmpeg.codec, r.ffmpeg.audio_codec = 'MPEG4', 'H264', 'AAC'
    r.filepath = HERE + 'renders/bounce.mp4'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'


with open(settings.prepared()) as f:
    prepared = json.load(f)
flights = [flight.Flight(n, launch, land, (ox, oy), (tx, ty)) for n, launch, land, ox, oy, tx, ty in prepared['flights']]

sc = fresh_scene('Bounce')
sc.render.fps = FPS
sc.frame_start = 1
sc.frame_end = len(prepared['camera']['centre'])
frames = list(range(sc.frame_start, sc.frame_end + 1))
score = score_mesh(sc, prepared['svg'], prepared['page'])
paper(sc, prepared['page']['box'] * SPACE)
col = bpy.data.collections.new('Lights')
sc.collection.children.link(col)
lights.build(col, flights, prepared['held'], SPACE, INK, lambda t: 1 + (LEAD + t) * FPS, bake)
camera_and_light(sc, frames, prepared['camera'])
bloom(sc)
sound_and_output(sc, prepared['wav'])
print(f'{len(flights)} notes, {len(frames)} frames, {len(score.data.polygons)} score faces')
