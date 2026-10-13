import * as THREE from 'three';

const COLOUR = new THREE.Color(0.78, 0.75, 0.7);
const TILE = 6; // staff spaces one tile of the grain covers
const RELIEF = 0.35; // how steep the grain's bumps are
const SIZE = 256; // texels a side
// lattice cells across a tile, and how much each octave adds: blotches about a staff space wide, then finer tooth
const OCTAVES = [
	[6, 1],
	[12, 0.55],
	[24, 0.3],
	[48, 0.16],
	[96, 0.08]
];

export interface Paper {
	mesh: THREE.Mesh;
	/** Lays the paper well past a score this long and behind it, into the dark (build.paper). */
	fit(length: number): void;
	dispose(): void;
}

/** Heavy, toothy watercolour-like paper: a grain the lamp grazes and the lit heads pool light in. */
export function createPaper(anisotropy: number): Paper {
	const grain = grainTexture();
	grain.anisotropy = anisotropy;
	const material = new THREE.MeshStandardMaterial({ color: COLOUR, roughness: 0.75, normalMap: grain });
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
	return {
		mesh,
		fit(length) {
			const [w, h] = [length + 120, 320];
			mesh.scale.set(w, h, 1);
			mesh.position.set(length / 2, 80, 0);
			grain.repeat.set(w / TILE, h / TILE);
		},
		dispose() {
			mesh.geometry.dispose();
			material.dispose();
			grain.dispose();
		}
	};
}

/** A tiling normal map from a few octaves of value noise, seeded so the paper is the same every load. */
function grainTexture() {
	let seed = 7;
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const height = new Float32Array(SIZE * SIZE);
	for (const [cells, amount] of OCTAVES) {
		const lattice = Float32Array.from({ length: cells * cells }, random);
		const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)];
		for (let y = 0; y < SIZE; y++)
			for (let x = 0; x < SIZE; x++) {
				const [fx, fy] = [(x / SIZE) * cells, (y / SIZE) * cells];
				const [i, j] = [Math.floor(fx), Math.floor(fy)];
				const [u, v] = [smooth(fx - i), smooth(fy - j)];
				const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
				const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
				height[y * SIZE + x] += amount * (top + (bottom - top) * v);
			}
	}
	const texels = new Uint8Array(SIZE * SIZE * 4);
	const h = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
	const n = new THREE.Vector3();
	for (let y = 0; y < SIZE; y++)
		for (let x = 0; x < SIZE; x++) {
			// the slope per texel, scaled to a tile so RELIEF doesn't depend on SIZE
			const scale = (RELIEF * SIZE) / 64;
			n.set(-(h(x + 1, y) - h(x - 1, y)) * scale, -(h(x, y + 1) - h(x, y - 1)) * scale, 1).normalize();
			texels.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * SIZE + x) * 4);
		}
	const texture = new THREE.DataTexture(texels, SIZE, SIZE);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
