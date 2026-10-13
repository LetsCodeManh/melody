import * as THREE from 'three';

/** A shape raised `height` thick. */
export interface Solid {
	shape: THREE.Shape;
	height: number;
}

const CURVE_SEGMENTS = 4;

/** Shapes drawn y down (as in SVG) raised into solids y up on z = 0, as one mesh with one group (and material) per list.
 * Each solid runs from z = 0 to its height, its outline at full size from `bevel` up to `height - bevel` and chamfered
 * inwards by `bevel` at the top and the foot. Flat-shaded: positions and normals only.
 *
 * The same vertices as three's ExtrudeGeometry (bevelSegments 1, bevelOffset -bevel, turned over about x and lifted),
 * written straight into one buffer: ExtrudeGeometry builds them in plain arrays with UVs and Vector2s, ~10× the mesh
 * in garbage, which a long score's load (2 M vertices) spikes the tab with. */
export function extrude(lists: readonly (readonly Solid[])[], bevel: number): THREE.BufferGeometry {
	const outlines = lists.map((solids) => solids.map((s) => outline(s.shape, bevel)));
	const total = outlines.flat().reduce((n, o) => n + vertexCount(o), 0);
	const position = new Float32Array(total * 3);
	const normal = new Float32Array(total * 3);
	const geometry = new THREE.BufferGeometry();
	let at = 0; // vertices written
	lists.forEach((solids, group) => {
		const start = at;
		solids.forEach((s, i) => (at = write(outlines[group][i], s.height, bevel, position, normal, at)));
		geometry.addGroup(start, at - start, group);
	});
	if (at !== total) throw new Error(`extrude: counted ${total} vertices, wrote ${at}`);
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
	return geometry;
}

/** A shape's points (the outline, then each hole's) with the direction each moves to chamfer, and its lid's triangles. */
interface Outline {
	xy: Float64Array;
	moves: Float64Array;
	rings: number[]; // points per ring: the outline's, then each hole's
	faces: number[][];
}

const vertexCount = (o: Outline) => 6 * o.faces.length + 18 * (o.xy.length / 2);

function outline(shape: THREE.Shape, bevel: number): Outline {
	const extracted = shape.extractPoints(CURVE_SEGMENTS);
	let contour = extracted.shape;
	const holes = extracted.holes;
	// the outline clockwise, holes the other way, as ExtrudeGeometry has them
	if (!THREE.ShapeUtils.isClockWise(contour)) {
		contour = contour.reverse();
		for (let h = 0; h < holes.length; h++) if (THREE.ShapeUtils.isClockWise(holes[h])) holes[h] = holes[h].reverse();
	}
	const rings = [contour, ...holes];
	rings.forEach(mergeOverlapping);
	const count = rings.reduce((n, r) => n + r.length, 0);
	const xy = new Float64Array(count * 2);
	const moves = new Float64Array(count * 2);
	let k = 0;
	for (const ring of rings)
		ring.forEach((p, i) => {
			xy[2 * k] = p.x;
			xy[2 * k + 1] = p.y;
			bevelVec(p, ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length], moves, 2 * k);
			k++;
		});
	// the lids are the outline chamfered in
	let first = 0;
	const inset = rings.map((ring) => {
		const points = ring.map((_, i) => {
			const at = 2 * (first + i);
			return new THREE.Vector2(xy[at] - moves[at] * bevel, xy[at + 1] - moves[at + 1] * bevel);
		});
		first += ring.length;
		return points;
	});
	const faces = THREE.ShapeUtils.triangulateShape(inset[0], inset.slice(1));
	return { xy, moves, rings: rings.map((r) => r.length), faces };
}

/** Writes the solid's triangles from vertex `at` on; returns the vertex after them. Four layers of the outline, top
 * down: chamfered in at the height, full size at height - bevel and at bevel, chamfered in at z = 0. */
function write(o: Outline, height: number, bevel: number, position: Float32Array, normal: Float32Array, at: number): number {
	const { xy, moves } = o;
	// ExtrudeGeometry places the layers at z = -bevel, 0, depth, depth + bevel, then turns them over and lifts them
	const depth = height - 2 * bevel;
	const lift = height - bevel;
	const z = [lift + bevel, lift, lift - depth, lift - depth - bevel];
	const shift = [-bevel, 0, 0, -bevel];
	const corners = new Float64Array(9);
	const corner = (c: number, layer: number, i: number) => {
		corners[3 * c] = xy[2 * i] + moves[2 * i] * shift[layer];
		corners[3 * c + 1] = -(xy[2 * i + 1] + moves[2 * i + 1] * shift[layer]); // y down to y up
		corners[3 * c + 2] = z[layer];
	};
	const triangle = (la: number, a: number, lb: number, b: number, lc: number, c: number) => {
		corner(0, la, a);
		corner(1, lb, b);
		corner(2, lc, c);
		// the face's normal, (c - b) × (a - b), on all three corners
		const ux = corners[6] - corners[3], uy = corners[7] - corners[4], uz = corners[8] - corners[5];
		const vx = corners[0] - corners[3], vy = corners[1] - corners[4], vz = corners[2] - corners[5];
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
		for (let k = 0; k < 9; k++) position[3 * at + k] = corners[k];
		for (let k = 0; k < 3; k++, at++) {
			normal[3 * at] = nx / length;
			normal[3 * at + 1] = ny / length;
			normal[3 * at + 2] = nz / length;
		}
	};
	for (const [a, b, c] of o.faces) triangle(0, c, 0, b, 0, a);
	for (const [a, b, c] of o.faces) triangle(3, a, 3, b, 3, c);
	// the walls, ring by ring, each point back to the one before it, down through the layers
	let first = 0;
	for (const length of o.rings) {
		for (let i = length - 1; i >= 0; i--) {
			const j = first + i;
			const k = first + (i === 0 ? length - 1 : i - 1);
			for (let layer = 0; layer < 3; layer++) {
				triangle(layer, j, layer, k, layer + 1, j);
				triangle(layer, k, layer + 1, k, layer + 1, j);
			}
		}
		first += length;
	}
	return at;
}

/** ExtrudeGeometry's: drops a point within a hair of the one before it (round the ring). */
function mergeOverlapping(points: THREE.Vector2[]) {
	const THRESHOLD_SQ = 1e-20;
	let prev = points[0];
	for (let i = 1; i <= points.length; i++) {
		const at = i % points.length;
		const p = points[at];
		const scale = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(prev.x), Math.abs(prev.y));
		if ((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 <= THRESHOLD_SQ * scale * scale) {
			points.splice(at, 1);
			i--;
			continue;
		}
		prev = p;
	}
}

/** ExtrudeGeometry's getBevelVec: the direction a ring's point moves as the ring grows by one, its corner mitred (at most
 * √2 long), written to out[at], out[at + 1]. */
function bevelVec(pt: THREE.Vector2, prev: THREE.Vector2, next: THREE.Vector2, out: Float64Array, at: number) {
	let tx: number, ty: number, shrink: number;
	const px = pt.x - prev.x, py = pt.y - prev.y;
	const nx = next.x - pt.x, ny = next.y - pt.y;
	const prevSq = px * px + py * py;
	const collinear = px * ny - py * nx;
	if (Math.abs(collinear) > Number.EPSILON) {
		const prevLen = Math.sqrt(prevSq);
		const nextLen = Math.sqrt(nx * nx + ny * ny);
		const psx = prev.x - py / prevLen, psy = prev.y + px / prevLen;
		const nsx = next.x - ny / nextLen, nsy = next.y + nx / nextLen;
		const sf = ((nsx - psx) * ny - (nsy - psy) * nx) / (px * ny - py * nx);
		tx = psx + px * sf - pt.x;
		ty = psy + py * sf - pt.y;
		const transSq = tx * tx + ty * ty;
		if (transSq <= 2) {
			out[at] = tx;
			out[at + 1] = ty;
			return;
		}
		shrink = Math.sqrt(transSq / 2);
	} else {
		// straight on, or straight back
		let same = false;
		if (px > Number.EPSILON) same = nx > Number.EPSILON;
		else if (px < -Number.EPSILON) same = nx < -Number.EPSILON;
		else same = Math.sign(py) === Math.sign(ny);
		tx = same ? -py : px;
		ty = same ? px : py;
		shrink = Math.sqrt(same ? prevSq : prevSq / 2);
	}
	out[at] = tx / shrink;
	out[at + 1] = ty / shrink;
}
