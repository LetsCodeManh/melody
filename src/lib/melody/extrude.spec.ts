import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { extrude, type Solid } from './extrude';

const BEVEL = 0.02;

/** The score's mesh as it was built before extrude(): three's ExtrudeGeometry, turned over and lifted, merged. */
function reference(lists: Solid[][], bevel: number) {
	const parts = lists.flat().map(({ shape, height }) => {
		const g = new THREE.ExtrudeGeometry(shape, {
			depth: height - 2 * bevel,
			curveSegments: 4,
			bevelEnabled: true,
			bevelThickness: bevel,
			bevelSize: bevel,
			bevelOffset: -bevel,
			bevelSegments: 1
		});
		g.scale(1, -1, -1).translate(0, 0, height - bevel);
		const only = new THREE.BufferGeometry();
		for (const name of ['position', 'normal']) only.setAttribute(name, g.getAttribute(name));
		return only;
	});
	return mergeGeometries(parts);
}

const polygon = (points: [number, number][]) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));

// a notehead-like ring: curves, a hole, drawn anticlockwise so ExtrudeGeometry turns it round
const ring = new THREE.Shape().absellipse(0, 0, 0.6, 0.45, 0, 2 * Math.PI, false, 0.3);
ring.holes.push(new THREE.Path().absellipse(0, 0, 0.3, 0.15, 0, 2 * Math.PI, true, 0.3));
// a staff line: a long thin band with points along its edges in a straight line
const staffLine = polygon([[0, 0], [5, 0], [10, 0.001], [15, 0], [15, 0.1], [7, 0.1], [0, 0.1]]);
// a beam, clockwise, with a sharp corner and a repeated closing point
const beam = polygon([[0, 0], [0, 0.5], [3, 1.4], [3.2, 0.9], [0.01, 0], [0, 0]]);
// a sharp spike: its mitre is cut short
const spike = polygon([[0, 0], [4, 0.05], [0, 0.1]]);

describe('extrude', () => {
	const lists: Solid[][] = [
		[{ shape: ring, height: 0.1 }, { shape: beam, height: 0.1 }, { shape: spike, height: 0.1 }],
		[{ shape: staffLine, height: 0.05 }]
	];

	it('makes the same triangles as ExtrudeGeometry did, normals and all', () => {
		const want = reference(lists, BEVEL);
		const got = extrude(lists, BEVEL);
		for (const name of ['position', 'normal']) {
			const [a, b] = [got.getAttribute(name).array as Float32Array, want.getAttribute(name).array as Float32Array];
			expect(a.length).toBe(b.length);
			const worst = a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
			// three takes normals from the positions rounded to float32, extrude() before: the chamfer's tiny faces differ
			// by ~1e-5 (a thousandth of a degree)
			expect(worst, name).toBeLessThan(name === 'normal' ? 1e-4 : 1e-5);
		}
	});

	it('gives each list its own group and material, in order', () => {
		const count = (solids: Solid[]) => reference([solids], BEVEL).getAttribute('position').count;
		const [print, staff] = lists.map(count);
		expect(extrude(lists, BEVEL).groups).toEqual([
			{ start: 0, count: print, materialIndex: 0 },
			{ start: print, count: staff, materialIndex: 1 }
		]);
	});

	it('stands each solid on the paper, up to its height', () => {
		const z = extrude([[{ shape: beam, height: 0.3 }]], BEVEL).getAttribute('position');
		const zs = Array.from({ length: z.count }, (_, i) => z.getZ(i));
		expect(Math.min(...zs)).toBeCloseTo(0, 6);
		expect(Math.max(...zs)).toBeCloseTo(0.3, 6);
	});
});
