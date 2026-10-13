import * as THREE from 'three';
import type { Look } from './looks';
import { INK, type Prepared } from './melody';

// What a comet does to the page as it lands (lengths in staff spaces, times in s), heavier notes harder
const ON_PAPER = 0.004; // just over the paper, under the raised print
const RIPPLE_REACH = 2.2; // radius a ring spreads to, for a key struck middling hard
const RIPPLE_WIDTH = 0.12;
const RIPPLE_LIFE = 0.8;
const RIPPLE_GLOW = 2.5;
const SPARKS = 10; // most per landing: the lightest notes throw 3
const SPARK_SIZE = 0.16;
const SPARK_LIFE = 0.55;
const SPARK_GLOW = 14;
const GRAVITY = 30;
const DRAG = 4; // per s: sparks skid to a stop on the paper
const GLOWS = 8; // lights pooling on the paper, at the freshest landings
const GLOW_POWER = 90; // candela, for a note of middling weight
const GLOW_HEIGHT = 0.35; // over the print: how wide the pool spreads
const GLOW_FADE = 2; // s for a pool to fade to a third, as newer landings take the lights
const HANDOFF = 0.15; // s for a newer landing to count in full against an older pool

export interface Landings {
	/** On the paper: a ring of light spreading from each landing. */
	ripples: THREE.Mesh;
	/** Over everything: sparks thrown up by each landing, falling back and skidding out. */
	sparks: THREE.Points;
	/** Lights at the freshest landings, pooling their colour on the paper and catching the print's gloss. */
	glows: THREE.Group;
	setTime(t: number): void;
	setViewHeight(px: number): void;
}

/** Ripples and sparks for every landing, moved on the GPU by the shared time uniform, as the comets are. */
export function createLandings(song: Prepared, looks: Look[], time: { value: number }): Landings {
	const ripples = new THREE.Mesh(rippleGeometry(song, looks), rippleMaterial(time));
	const height = { value: 1 };
	const sparks = new THREE.Points(sparkGeometry(song, looks), sparkMaterial(time, height));
	ripples.frustumCulled = sparks.frustumCulled = false;
	const glows = createGlows(song, looks);
	return { ripples, sparks, glows: glows.group, setTime: glows.setTime, setViewHeight: (px) => void (height.value = px) };
}

/** A fixed set of lights (so no shader ever recompiles) handed each frame to the freshest landings: a flash as heavy as
 * the note, then a glow fading as the music moves on. */
function createGlows({ flights }: Prepared, looks: Look[]) {
	const landings = flights.map(([note, , land, , , x, y]) => ({ land, x, y, ...looks[note] })).sort((a, b) => a.land - b.land);
	const lands = landings.map((l) => l.land);
	const lights = Array.from({ length: GLOWS }, () => new THREE.PointLight(0xffffff, 0, 0, 2));
	const group = new THREE.Group().add(...lights);
	return {
		group,
		setTime(t: number) {
			let [lo, hi] = [0, landings.length];
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (landings[mid].land <= t) lo = mid + 1;
				else hi = mid;
			}
			lights.forEach((light, k) => {
				const at = landings[lo - 1 - k];
				const age = at ? t - at.land : Infinity;
				light.intensity = 0;
				if (age > 5 * GLOW_FADE) return;
				const flash = 0.4 + 2.6 * Math.exp(-age / 0.15);
				const share = poolShare(lands, lo - 1 - k, t);
				light.intensity = GLOW_POWER * (0.5 + at.weight) * flash * Math.exp(-age / GLOW_FADE) * share;
				light.position.set(at.x, at.y, INK + GLOW_HEIGHT);
				light.color.copy(at.colour);
			});
		}
	};
}

/** How much of its pool the landing at `i` of the sorted `lands` keeps at `t`: less with each newer landing, eased in
 * over HANDOFF, so it is dark by the time the GLOWS-th newer one takes its light rather than going out at once. A big
 * chord landing together can still take a lit pool's light, under its own flash. */
export function poolShare(lands: number[], i: number, t: number) {
	if (lands[i] > t) return 0;
	let [newer, count] = [0, 0];
	for (let j = i + 1; j < lands.length && lands[j] <= t; j++, count++) newer += Math.min((t - lands[j]) / HANDOFF, 1);
	return count >= GLOWS ? 0 : Math.max(0, 1 - (newer / (GLOWS - 1)) ** 2);
}

/** A square on the paper around each landing, as wide as its ring gets; the shader draws the ring in it. The harder
 * the key is struck, the further the ring spreads. */
function rippleGeometry({ flights }: Prepared, looks: Look[]) {
	const position = new Float32Array(flights.length * 4 * 3);
	const corner = new Float32Array(flights.length * 4 * 2);
	const land = new Float32Array(flights.length * 4);
	const look = new Float32Array(flights.length * 4 * 4);
	const index: number[] = [];
	flights.forEach(([note, , t, , , x, y], f) => {
		const { colour, strike } = looks[note];
		const reach = RIPPLE_REACH * (0.5 + strike) + RIPPLE_WIDTH;
		[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([cx, cy], k) => {
			const v = f * 4 + k;
			position.set([x + cx * reach, y + cy * reach, ON_PAPER], v * 3);
			corner.set([cx * reach, cy * reach], v * 2);
			land[v] = t;
			look.set([colour.r, colour.g, colour.b, strike], v * 4);
		});
		index.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(position, 3));
	g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
	g.setAttribute('aLand', new THREE.BufferAttribute(land, 1));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	g.setIndex(index);
	return g;
}

function rippleMaterial(time: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: { uTime: time },
		vertexShader: /* glsl */ `
			attribute vec2 aCorner;
			attribute float aLand;
			attribute vec4 aLook;
			varying vec2 vAt;
			varying float vLand;
			varying vec4 vLook;
			void main() {
				vAt = aCorner;
				vLand = aLand;
				vLook = aLook;
				gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			varying vec2 vAt;
			varying float vLand;
			varying vec4 vLook; // colour, strike
			const float REACH = ${RIPPLE_REACH.toFixed(4)}, WIDTH = ${RIPPLE_WIDTH.toFixed(4)};
			const float LIFE = ${RIPPLE_LIFE.toFixed(4)}, GLOW = ${RIPPLE_GLOW.toFixed(4)};
			void main() {
				float age = (uTime - vLand) / LIFE;
				if (age < 0.0 || age > 1.0) discard;
				// fast out, slowing as it spreads, fading as it goes
				float front = REACH * (0.5 + vLook.w) * (1.0 - pow(1.0 - age, 3.0));
				float ring = smoothstep(WIDTH, 0.0, abs(length(vAt) - front));
				gl_FragColor = vec4(vLook.rgb * GLOW * ring * pow(1.0 - age, 2.0), 1.0);
			}`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false
	});
}

/** Each spark: where and when it's thrown, and how fast, from a seeded random so every play throws the same. */
function sparkGeometry({ flights }: Prepared, looks: Look[]) {
	let seed = 1;
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const count = flights.length * SPARKS;
	const start = new Float32Array(count * 3);
	const velocity = new Float32Array(count * 3);
	const look = new Float32Array(count * 4);
	flights.forEach(([note, , land, , , x, y], f) => {
		const { colour, weight } = looks[note];
		const thrown = 3 + (SPARKS - 3) * weight;
		for (let k = 0; k < SPARKS; k++) {
			const v = f * SPARKS + k;
			const [angle, speed, up] = [2 * Math.PI * random(), (1.5 + 2.5 * random()) * (0.6 + 0.8 * weight), 2 + 3 * random()];
			start.set([x, y, land], v * 3);
			velocity.set([speed * Math.cos(angle), speed * Math.sin(angle), up], v * 3);
			// the ones past what this note throws are never shown
			look.set([colour.r, colour.g, colour.b, k < thrown ? 1 : 0], v * 4);
		}
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
	g.setAttribute('aVelocity', new THREE.BufferAttribute(velocity, 3));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	return g;
}

function sparkMaterial(time: { value: number }, height: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: { uTime: time, uHeight: height },
		vertexShader: /* glsl */ `
			uniform float uTime, uHeight;
			attribute vec3 aStart;     // x, y, time thrown
			attribute vec3 aVelocity;
			attribute vec4 aLook;      // colour, shown
			varying vec3 vColour;
			const float LIFE = ${SPARK_LIFE.toFixed(4)}, SIZE = ${SPARK_SIZE.toFixed(4)}, GLOW = ${SPARK_GLOW.toFixed(4)};
			const float GRAVITY = ${GRAVITY.toFixed(4)}, DRAG = ${DRAG.toFixed(4)}, LIFT = ${INK.toFixed(4)}, FLOOR = ${ON_PAPER.toFixed(4)};
			void main() {
				float age = uTime - aStart.z;
				float left = (age >= 0.0 && age < LIFE) ? (1.0 - age / LIFE) * aLook.w : 0.0;
				vec2 slide = aVelocity.xy * (1.0 - exp(-DRAG * age)) / DRAG;
				float z = max(LIFT + aVelocity.z * age - 0.5 * GRAVITY * age * age, FLOOR);
				vec4 view = viewMatrix * vec4(aStart.xy + slide, z, 1.0);
				gl_Position = projectionMatrix * view;
				// world size to pixels: the projection's focal length over the distance, times half the buffer height
				gl_PointSize = left > 0.0 ? SIZE * left * projectionMatrix[1][1] * 0.5 * uHeight / -view.z : 0.0;
				vColour = aLook.rgb * GLOW * pow(left, 1.5);
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vColour;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				gl_FragColor = vec4(vColour * smoothstep(0.5, 0.2, d), 1.0);
			}`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthTest: false,
		depthWrite: false
	});
}
