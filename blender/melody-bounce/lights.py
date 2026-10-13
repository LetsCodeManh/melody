# The lights: a comet per note that flies along its arc and lands on the note's head, and the head lighting up and
# staying lit. Each comet is a curve whose visible stretch (bevel start/end) is keyframed, so no handlers are needed.
import bpy, math
import flight

COMET_COLOUR = (1.0, 0.72, 0.42, 1)
COMET_GLOW = 30.0
COMET_WIDTH = 0.09      # staff spaces: bevel radius at the comet's head
TAIL = 0.55             # share of the arc visible behind the head
DRAIN = 0.12            # s for the tail to run into the head after landing
POINTS = 32             # per arc
FLASH, SUSTAIN = 20.0, 3.0  # head glow at the hit, and after it settles
SETTLE = 0.35           # s
RISE = 0.1              # s for a held head (a tied note ringing on) to come up to SUSTAIN, with no flash
HEAD_RADII = (0.66, 0.47)   # staff spaces: a black notehead
HEAD_TILT = math.radians(20)


def emission_material(name, colour, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = colour
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return mat


def head_material():
    """Ink black until lit; the glow comes from each head's 'glow' property so all heads share one material."""
    mat = bpy.data.materials.new('LitHead')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Emission Color'].default_value = COMET_COLOUR
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_type, attr.attribute_name = 'OBJECT', 'glow'
    nt.links.new(attr.outputs['Fac'], bsdf.inputs['Emission Strength'])
    return mat


def taper():
    """Thin at the tail, full at the head."""
    cu = bpy.data.curves.new('CometTaper', 'CURVE')
    sp = cu.splines.new('POLY')
    sp.points.add(2)
    for p, (x, y) in zip(sp.points, ((0, 0.05), (0.85, 1.0), (1.0, 0.7))):
        p.co = (x, y, 0, 1)
    return bpy.data.objects.new('CometTaper', cu)


def head_mesh(space):
    mesh = bpy.data.meshes.new('LitHead')
    rx, ry = HEAD_RADII[0] * space, HEAD_RADII[1] * space
    verts = [(0, 0, 0)]
    for i in range(24):
        a = 2 * math.pi * i / 24
        x, y = rx * math.cos(a), ry * math.sin(a)
        verts.append((x * math.cos(HEAD_TILT) - y * math.sin(HEAD_TILT), x * math.sin(HEAD_TILT) + y * math.cos(HEAD_TILT), 0))
    mesh.from_pydata(verts, [], [(0, i + 1, (i + 1) % 24 + 1) for i in range(24)])
    mesh.materials.append(head_material())
    return mesh


def build(col, flights, held, space, lift, frame, bake):
    """flights: flight.Flight in page units; held: (note, time, x, y) for heads a note rings on to; space: metres per
    staff space; lift: z of the ink's top; frame(t) maps song seconds to frames; bake(id, path, index, frames, values)
    keyframes in bulk."""
    taper_ob = taper()
    col.objects.link(taper_ob)
    taper_ob.hide_render = taper_ob.hide_viewport = True
    comet = emission_material('Comet', COMET_COLOUR, COMET_GLOW)
    mesh = head_mesh(space)
    for f in flights:
        x, y = f.target
        head = bpy.data.objects.new(f'Head.{f.note:03d}', mesh)
        col.objects.link(head)
        head.location = (x * space, y * space, lift + 0.0002)
        head['glow'] = 0.0
        hit = frame(f.land)
        bake(head, '["glow"]', 0, [hit - 1, hit, hit + SETTLE * (frame(1) - frame(0))], [0.0, FLASH, SUSTAIN])

        cu = bpy.data.curves.new(f'Comet.{f.note:03d}', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth, cu.bevel_resolution = COMET_WIDTH * space, 2
        cu.taper_object, cu.use_map_taper = taper_ob, True
        cu.bevel_factor_mapping_start = cu.bevel_factor_mapping_end = 'SPLINE'
        sp = cu.splines.new('POLY')
        sp.points.add(POINTS - 1)
        for i, p in enumerate(sp.points):
            px, py, h = flight.arc(f, i / (POINTS - 1))
            p.co = (px * space, py * space, lift + h * space, 1)
        cu.materials.append(comet)
        ob = bpy.data.objects.new(cu.name, cu)
        col.objects.link(ob)
        launch, land = frame(f.launch), frame(f.land)
        drained = land + DRAIN * (frame(1) - frame(0))
        bake(cu, 'bevel_factor_end', 0, [launch, land], [0.0, 1.0])
        bake(cu, 'bevel_factor_start', 0, [launch, land, drained], [0.0, 1 - TAIL, 1.0])

    for i, (note, t, x, y) in enumerate(held):
        head = bpy.data.objects.new(f'Held.{i:03d}', mesh)
        col.objects.link(head)
        head.location = (x * space, y * space, lift + 0.0002)
        head['glow'] = 0.0
        bake(head, '["glow"]', 0, [frame(t - RISE), frame(t)], [0.0, SUSTAIN])
