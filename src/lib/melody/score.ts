import * as THREE from 'three';
import { SVGLoader, type StrokeStyle } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** LilyPond's engraved SVG as one flat mesh in page units (staff spaces, y up), the coordinates the comets fly in.
 * Vector shapes rather than a texture: sharp however close the camera gets, and no texture size limit on long scores.
 * SVGLoader ignores the root viewBox, so the shapes come out in LilyPond's units, which are staff spaces. */
export function scoreGeometry(svg: string): THREE.BufferGeometry {
	const parts: THREE.BufferGeometry[] = [];
	// LilyPond inks in currentColor, which three's colour parser doesn't know; the ink's material sets the colour anyway
	for (const path of new SVGLoader().parse(svg.replaceAll('currentColor', 'black')).paths) {
		const style = path.userData?.style as (StrokeStyle & { fill?: string; stroke?: string }) | undefined;
		if (style?.fill && style.fill !== 'none')
			for (const shape of path.toShapes()) parts.push(new THREE.ShapeGeometry(shape, 4));
		// staff lines are strokes only; beams and slurs are filled and stroked
		if (style?.stroke && style.stroke !== 'none')
			for (const sub of path.subPaths) {
				const stroke = SVGLoader.pointsToStroke(sub.getPoints(), style);
				if (stroke) parts.push(stroke);
			}
	}
	if (!parts.length) throw new Error('the score has no shapes');
	const flat = parts.map((g) => {
		const only = new THREE.BufferGeometry().setAttribute('position', (g.index ? g.toNonIndexed() : g).getAttribute('position'));
		g.dispose();
		return only;
	});
	const merged = mergeGeometries(flat);
	for (const g of flat) g.dispose();
	return merged.scale(1, -1, 1); // SVG y points down the page
}
