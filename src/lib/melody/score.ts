import * as THREE from 'three';
import { SVGLoader, type StrokeStyle } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BEVEL = 0.02; // staff spaces the print's top edges are chamfered by: where its gloss catches the light
const MITRE = 2; // longest a stroke's corner may reach, in stroke widths
const STAFF_LINES = 0.5; // of the print's height: the notes stand over the staff lines they cross, as ink printed on them

/** LilyPond's engraved SVG as one mesh of raised print, `height` thick (the staff lines less), on the paper at z = 0,
 * in page units (staff spaces, y up), the coordinates the comets fly in. Two groups, one material each: the print (0)
 * and the staff lines (1). Vector shapes rather than a texture: sharp however close the camera gets, and no texture
 * size limit on long scores. SVGLoader ignores the root viewBox, so the shapes come out in LilyPond's units, which are
 * staff spaces. */
export function scoreGeometry(svg: string, height: number): THREE.BufferGeometry {
	const print: THREE.Shape[] = [];
	const staff: THREE.Shape[] = [];
	// LilyPond inks in currentColor, which three's colour parser doesn't know; the ink's material sets the colour anyway
	for (const path of new SVGLoader().parse(svg.replaceAll('currentColor', 'black')).paths) {
		const style = path.userData?.style as (StrokeStyle & { fill?: string; stroke?: string }) | undefined;
		const width = style?.stroke && style.stroke !== 'none' ? style.strokeWidth : 0;
		// SVGLoader fills by default, so a <line> comes with a fill of no area: it is a stroke only
		const filled = style?.fill && style.fill !== 'none' ? path.toShapes().filter((s) => Math.abs(THREE.ShapeUtils.area(s.getPoints())) > 1e-6) : [];
		if (filled.length)
			for (const shape of filled) {
				// beams and slurs are filled and stroked: the stroke widens the outline by half its width
				const outline = width ? Object.assign(new THREE.Shape(grown(shape.getPoints(4), width / 2)), { holes: shape.holes }) : shape;
				print.push(outline);
			}
		// staff lines are strokes only
		else if (width)
			for (const sub of path.subPaths) {
				const outline = band(sub.getPoints(4), width);
				if (outline.length) staff.push(new THREE.Shape(outline));
			}
	}
	if (!print.length) throw new Error('the score has no shapes');
	const shapes: (readonly [THREE.Shape, number])[] = [
		...print.map((s) => [s, height] as const),
		...staff.map((s) => [s, height * STAFF_LINES] as const)
	];
	const parts = shapes.map(([shape, tall]) => {
		const g = new THREE.ExtrudeGeometry(shape, {
			depth: tall - 2 * BEVEL,
			curveSegments: 4,
			bevelEnabled: true,
			bevelThickness: BEVEL,
			bevelSize: BEVEL,
			bevelOffset: -BEVEL, // chamfer inwards, so the print's foot is the engraved outline
			bevelSegments: 1
		});
		// SVG y points down the page. Turning it over about x flips y without mirroring (which would turn the faces
		// inside out); it sends the print below the paper, so lift it back: it ran from -BEVEL to tall - BEVEL
		g.scale(1, -1, -1).translate(0, 0, tall - BEVEL);
		const only = new THREE.BufferGeometry();
		for (const name of ['position', 'normal']) only.setAttribute(name, g.getAttribute(name));
		g.dispose();
		return only;
	});
	const inked = parts.slice(0, print.length).reduce((n, g) => n + g.getAttribute('position').count, 0);
	const merged = mergeGeometries(parts);
	for (const g of parts) g.dispose();
	merged.addGroup(0, inked, 0);
	merged.addGroup(inked, merged.getAttribute('position').count - inked, 1);
	return merged;
}

/** A closed outline pushed out by `by`: of the two ways to offset it, the larger. */
function grown(points: THREE.Vector2[], by: number): THREE.Vector2[] {
	const pts = distinct(points, true);
	if (pts.length < 3) return points;
	const [a, b] = [offset(pts, by, true), offset(pts, -by, true)];
	return Math.abs(THREE.ShapeUtils.area(a)) > Math.abs(THREE.ShapeUtils.area(b)) ? a : b;
}

/** An open polyline as the outline of a band `width` wide around it, its ends pushed out by half the width (round caps,
 * squared off). */
function band(points: THREE.Vector2[], width: number): THREE.Vector2[] {
	const pts = distinct(points, false);
	if (pts.length < 2) return [];
	const end = (at: number, inward: number) => pts[at].clone().addScaledVector(pts[at].clone().sub(pts[inward]).normalize(), width / 2);
	[pts[0], pts[pts.length - 1]] = [end(0, 1), end(pts.length - 1, pts.length - 2)];
	return [...offset(pts, width / 2, false), ...offset(pts, -width / 2, false).reverse()];
}

/** Without repeated points (a closed outline often ends on its first), which have no direction to offset along. */
function distinct(points: THREE.Vector2[], closed: boolean) {
	const pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-6);
	if (closed && pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) <= 1e-6) pts.pop();
	return pts;
}

/** Each point moved `by` along the mitred normal of its corner, reaching at most MITRE times `by`. */
function offset(points: THREE.Vector2[], by: number, closed: boolean): THREE.Vector2[] {
	const n = points.length;
	const normal = (a: THREE.Vector2, b: THREE.Vector2) => new THREE.Vector2(a.y - b.y, b.x - a.x).normalize();
	return points.map((p, i) => {
		const into = closed || i > 0 ? normal(points[(i - 1 + n) % n], p) : undefined;
		const out = closed || i < n - 1 ? normal(p, points[(i + 1) % n]) : undefined;
		const both = into && out ? into.clone().add(out) : undefined;
		// a corner turning right back on itself has no mitre: keep to the incoming side
		const mid = both && both.lengthSq() > 1e-6 ? both.normalize() : (into ?? out)!;
		const reach = into && out ? Math.min(1 / Math.max(mid.dot(into), 1e-3), MITRE) : 1;
		return p.clone().addScaledVector(mid, by * reach);
	});
}
