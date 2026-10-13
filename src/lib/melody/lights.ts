import * as THREE from 'three';
import { createLandings } from './landings';
import type { Look } from './looks';
import { INK, type Prepared } from './melody';

// The look of blender/melody-bounce/lights.py (lengths in staff spaces, times in s), live only: coloured by pitch,
// sized by weight, tails by speed, heads cooling to embers and going dark, held heads filling from their tie's side
const COMET_GLOW = 14;
const COMET_WIDTH = 0.15; // bevel radius at the comet's head, for a note of middling weight
// the hot white at a fresh head's centre, and a touch of it in the comets
const CORE = new THREE.Color(1.0, 0.9, 0.75);
const CORE_SHARE = 0.25; // of a comet's colour
const TAIL_TIME = 0.3; // s of flight the tail shows: a fast comet streaks, a slow one is a short spark
const TAIL_SHARE = [0.2, 0.85]; // of the arc
const DRAIN = 0.12; // for the tail to run into the head after landing
const FLASH = 30; // for a note of middling weight
const SUSTAIN = 4; // head glow at the hit, and after it settles
const SETTLE = 0.35;
const EMBER = 2.5; // what a lit head cools to, so the music just played stands out from what came before
const COOL = 4; // s for a head to cool most of the way from SUSTAIN to EMBER
const DARK = 8; // s for the ember to fade back to ink once it has cooled, as a light losing its power
const FILL = 0.15; // for a held head (a tied note ringing on) to fill up to SUSTAIN once reached, with no flash
const TRAIL_GLOW = 6; // the tie lit behind its ball: dimmer and thinner than a comet, flat on the ink
const TRAIL_WIDTH = 0.06;
const BALL = 0.15; // radius of the ball rolling along a tie, for a note of middling weight
const HEAD_RADII = [0.66, 0.47];
const HEAD_TILT = THREE.MathUtils.degToRad(20);

const RINGS = 24; // along each comet's visible stretch
const SIDES = 6;
const HEAD_SEGMENTS = 24;
const BALL_SEGMENTS = 12; // round the ball, half as many from pole to pole

export interface Lights {
	/** On the paper, with it in the depth of field: the heads and the ripples. */
	paper: THREE.Group;
	/** Drawn over everything after the depth of field: the comets and sparks. The blur's depth pass can't see
	 * vertices placed in a shader, and nothing in the scene stands taller than a comet. */
	overlay: THREE.Group;
	/** Song time in seconds: where every comet and spark is and how bright every head. */
	setTime(t: number): void;
	/** The drawing buffer's height in pixels, which sparks are sized by. */
	setViewHeight(px: number): void;
	dispose(): void;
}

/** A comet per note flying its arc onto the note's head, landing at the note's onset, and the head lighting up and
 * staying lit. Both are one draw each, moved on the GPU by a time uniform: nothing is updated per note per frame. */
export function createLights(song: Prepared, looks: Look[]): Lights {
	const time = { value: -Infinity };
	const comets = new THREE.Mesh(cometGeometry(song, looks), cometMaterial(song, time));
	const heads = new THREE.Mesh(headGeometry(song, looks), headMaterial(song, time));
	const trails = new THREE.Mesh(trailGeometry(song, looks), trailMaterial(time));
	const balls = new THREE.Mesh(ballGeometry(song, looks), ballMaterial(time));
	// their vertices move in the shaders, so their bounds mean nothing
	comets.frustumCulled = heads.frustumCulled = trails.frustumCulled = balls.frustumCulled = false;
	const landings = createLandings(song, looks, time);
	const [paper, overlay] = [new THREE.Group(), new THREE.Group()];
	paper.add(heads, landings.ripples, landings.glows);
	overlay.add(comets, trails, balls, landings.sparks);
	return {
		paper,
		overlay,
		setTime(t) {
			time.value = t;
			landings.setTime(t);
		},
		setViewHeight: landings.setViewHeight,
		dispose() {
			for (const m of [comets, heads, trails, balls, landings.ripples, landings.sparks]) {
				m.geometry.dispose();
				(m.material as THREE.Material).dispose();
			}
		}
	};
}

/** Each comet: RINGS rings of SIDES vertices that only know which flight they belong to and where along the visible
 * stretch they sit (0 tail, 1 head); the shader places them on the arc for the current time. */
function cometGeometry({ flights }: Prepared, looks: Look[]) {
	const per = RINGS * SIDES;
	const path = new Float32Array(flights.length * per * 4);
	const times = new Float32Array(flights.length * per * 2);
	const ring = new Float32Array(flights.length * per * 2);
	const look = new Float32Array(flights.length * per * 4);
	const index: number[] = [];
	flights.forEach(([note, launch, land, ox, oy, tx, ty], f) => {
		const { colour, weight } = looks[note];
		for (let r = 0; r < RINGS; r++)
			for (let k = 0; k < SIDES; k++) {
				const v = f * per + r * SIDES + k;
				path.set([ox, oy, tx, ty], v * 4);
				times.set([launch, land], v * 2);
				ring.set([r / (RINGS - 1), (2 * Math.PI * k) / SIDES], v * 2);
				look.set([colour.r, colour.g, colour.b, weight], v * 4);
				if (r < RINGS - 1) {
					const next = f * per + r * SIDES + ((k + 1) % SIDES);
					index.push(v, next, v + SIDES, next, next + SIDES, v + SIDES);
				}
			}
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flights.length * per * 3), 3));
	g.setAttribute('aPath', new THREE.BufferAttribute(path, 4));
	g.setAttribute('aTimes', new THREE.BufferAttribute(times, 2));
	g.setAttribute('aRing', new THREE.BufferAttribute(ring, 2));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	g.setIndex(index);
	return g;
}

function cometMaterial({ settings }: Prepared, time: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: time,
			uArc: { value: settings.arc },
			uMaxArc: { value: settings.maxArc }
		},
		vertexShader: /* glsl */ `
			uniform float uTime, uArc, uMaxArc;
			attribute vec4 aPath;   // origin xy, target xy
			attribute vec2 aTimes;  // launch, land
			attribute vec2 aRing;   // place along the visible stretch, angle around it
			attribute vec4 aLook;   // colour, weight
			varying vec3 vColour;
			const float TAIL_TIME = ${TAIL_TIME.toFixed(4)}, DRAIN = ${DRAIN.toFixed(4)};
			const float WIDTH = ${COMET_WIDTH.toFixed(4)}, LIFT = ${INK.toFixed(4)}, GLOW = ${COMET_GLOW.toFixed(4)};
			const vec3 CORE = vec3(${CORE.toArray().map((c) => c.toFixed(4))});

			${TAPER}

			void main() {
				float launch = aTimes.x, land = aTimes.y;
				// the visible stretch of the arc, in arc parameter u: bevel_factor_end and _start in lights.py
				float head = clamp((uTime - launch) / (land - launch), 0.0, 1.0);
				float share = clamp(TAIL_TIME / (land - launch), ${TAIL_SHARE[0].toFixed(4)}, ${TAIL_SHARE[1].toFixed(4)});
				float tail = uTime < land ? max(head - share, 0.0) : mix(1.0 - share, 1.0, clamp((uTime - land) / DRAIN, 0.0, 1.0));
				float shown = step(launch, uTime) * step(tail + 1e-4, head);
				float u = mix(tail, head, aRing.x);
				// flight.arc: x and y evenly with time, a parabola on top
				vec2 from = aPath.xy, along = aPath.zw - aPath.xy;
				float height = min(uArc * length(along), uMaxArc);
				vec3 centre = vec3(from + along * u, LIFT + height * 4.0 * u * (1.0 - u));
				vec3 tangent = normalize(vec3(along, height * 4.0 * (1.0 - 2.0 * u)) + vec3(1e-6, 0.0, 0.0));
				vec3 side = cross(tangent, vec3(0.0, 0.0, 1.0));
				side = length(side) > 1e-5 ? normalize(side) : vec3(0.0, 1.0, 0.0);
				vec3 up = cross(side, tangent);
				float radius = WIDTH * (0.7 + 0.6 * aLook.w) * taper(aRing.x) * shown;
				vec3 p = centre + radius * (cos(aRing.y) * side + sin(aRing.y) * up);
				vColour = mix(aLook.rgb, CORE, ${CORE_SHARE.toFixed(4)}) * GLOW;
				gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vColour;
			void main() { gl_FragColor = vec4(vColour, 1.0); }`,
		depthTest: false
	});
}

// thin at the tail, full near the head (lights.taper)
const TAPER = /* glsl */ `float taper(float s) { return s < 0.85 ? mix(0.05, 1.0, s / 0.85) : mix(1.0, 0.7, (s - 0.85) / 0.15); }`;

// a tie's printed curve: a cubic Bezier through its first two points (from) and last two (to)
const TIE = /* glsl */ `
	vec2 bezier(vec4 from, vec4 to, float u) {
		float v = 1.0 - u;
		return v * v * v * from.xy + 3.0 * u * v * v * from.zw + 3.0 * u * u * v * to.xy + u * u * u * to.zw;
	}
	vec2 slope(vec4 from, vec4 to, float u) {
		float v = 1.0 - u;
		return 3.0 * v * v * (from.zw - from.xy) + 6.0 * u * v * (to.xy - from.zw) + 3.0 * u * u * (to.zw - to.xy);
	}`;

// a lit head's steady glow t s after its hit: SUSTAIN, cooling to an EMBER, then fading back to ink
const COOLING = /* glsl */ `
	float cooling(float t) {
		const float SUSTAIN = ${SUSTAIN.toFixed(4)}, SETTLE = ${SETTLE.toFixed(4)}, EMBER = ${EMBER.toFixed(4)};
		const float COOL = ${COOL.toFixed(4)}, DARK = ${DARK.toFixed(4)};
		float glow = mix(SUSTAIN, EMBER, 1.0 - exp(-max(t - SETTLE, 0.0) / COOL));
		return glow * (1.0 - smoothstep(SETTLE + COOL, SETTLE + COOL + DARK, t));
	}`;

/** Each tie's trail: a thin tube of RINGS rings of SIDES vertices like the comets'; the shader places them on the
 * tie's curve for the current time. It lights the tie from its first head up to the ball, and stays lit once the ball
 * is in, fading with the head it reached. */
function trailGeometry({ ties }: Prepared, looks: Look[]) {
	const per = RINGS * SIDES;
	const from = new Float32Array(ties.length * per * 4);
	const to = new Float32Array(ties.length * per * 4);
	const times = new Float32Array(ties.length * per * 2);
	const ring = new Float32Array(ties.length * per * 2);
	const look = new Float32Array(ties.length * per * 4);
	const index: number[] = [];
	ties.forEach(([note, start, end, x0, y0, x1, y1, x2, y2, x3, y3], f) => {
		const { colour, weight } = looks[note];
		for (let r = 0; r < RINGS; r++)
			for (let k = 0; k < SIDES; k++) {
				const v = f * per + r * SIDES + k;
				from.set([x0, y0, x1, y1], v * 4);
				to.set([x2, y2, x3, y3], v * 4);
				times.set([start, end], v * 2);
				ring.set([r / (RINGS - 1), (2 * Math.PI * k) / SIDES], v * 2);
				look.set([colour.r, colour.g, colour.b, weight], v * 4);
				if (r < RINGS - 1) {
					const next = f * per + r * SIDES + ((k + 1) % SIDES);
					index.push(v, next, v + SIDES, next, next + SIDES, v + SIDES);
				}
			}
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ties.length * per * 3), 3));
	g.setAttribute('aFrom', new THREE.BufferAttribute(from, 4));
	g.setAttribute('aTo', new THREE.BufferAttribute(to, 4));
	g.setAttribute('aTimes', new THREE.BufferAttribute(times, 2));
	g.setAttribute('aRing', new THREE.BufferAttribute(ring, 2));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	g.setIndex(index);
	return g;
}

function trailMaterial(time: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: { uTime: time },
		vertexShader: /* glsl */ `
			uniform float uTime;
			attribute vec4 aFrom;   // the tie's first two Bezier points
			attribute vec4 aTo;     // its last two
			attribute vec2 aTimes;  // start, end
			attribute vec2 aRing;   // place along the lit stretch, angle around it
			attribute vec4 aLook;   // colour, weight
			varying vec3 vColour;
			const float SUSTAIN = ${SUSTAIN.toFixed(4)};
			const float WIDTH = ${TRAIL_WIDTH.toFixed(4)}, LIFT = ${INK.toFixed(4)}, GLOW = ${TRAIL_GLOW.toFixed(4)};
			const vec3 CORE = vec3(${CORE.toArray().map((c) => c.toFixed(4))});
			${TIE}
			${COOLING}

			void main() {
				float start = aTimes.x, end = aTimes.y;
				// lit from the tie's start up to the ball; once it is in, fading as the head it reached cools
				float reach = clamp((uTime - start) / (end - start), 0.0, 1.0);
				float fade = uTime < end ? 1.0 : cooling(uTime - end) / SUSTAIN;
				float shown = step(start, uTime) * step(1e-4, reach) * step(1e-3, fade);
				float u = reach * aRing.x;
				vec3 tangent = normalize(vec3(slope(aFrom, aTo, u), 0.0) + vec3(1e-6, 0.0, 0.0));
				vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
				vec3 up = cross(side, tangent);
				float radius = WIDTH * (0.7 + 0.6 * aLook.w) * shown;
				vec3 p = vec3(bezier(aFrom, aTo, u), LIFT) + radius * (cos(aRing.y) * side + sin(aRing.y) * up);
				vColour = mix(aLook.rgb, CORE, ${CORE_SHARE.toFixed(4)}) * GLOW * fade;
				gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vColour;
			void main() { gl_FragColor = vec4(vColour, 1.0); }`,
		depthTest: false
	});
}

/** Each tie's ball: a small sphere the shader rolls along the tie, setting off as the music reaches the tied note's
 * earlier head and reaching the later one as the music does, then sinking into it. */
function ballGeometry({ ties }: Prepared, looks: Look[]) {
	const sphere = new THREE.SphereGeometry(1, BALL_SEGMENTS, BALL_SEGMENTS / 2);
	const unit = sphere.getAttribute('position').array;
	const unitIndex = sphere.getIndex()!.array;
	const per = unit.length / 3;
	const position = new Float32Array(ties.length * per * 3);
	const from = new Float32Array(ties.length * per * 4);
	const to = new Float32Array(ties.length * per * 4);
	const times = new Float32Array(ties.length * per * 2);
	const look = new Float32Array(ties.length * per * 4);
	const index: number[] = [];
	ties.forEach(([note, start, end, x0, y0, x1, y1, x2, y2, x3, y3], f) => {
		const { colour, weight } = looks[note];
		position.set(unit, f * per * 3);
		for (let v = f * per; v < (f + 1) * per; v++) {
			from.set([x0, y0, x1, y1], v * 4);
			to.set([x2, y2, x3, y3], v * 4);
			times.set([start, end], v * 2);
			look.set([colour.r, colour.g, colour.b, weight], v * 4);
		}
		for (const i of unitIndex) index.push(f * per + i);
	});
	sphere.dispose();
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(position, 3)); // round the ball's centre, radius 1
	g.setAttribute('aFrom', new THREE.BufferAttribute(from, 4));
	g.setAttribute('aTo', new THREE.BufferAttribute(to, 4));
	g.setAttribute('aTimes', new THREE.BufferAttribute(times, 2));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	g.setIndex(index);
	return g;
}

function ballMaterial(time: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: { uTime: time },
		vertexShader: /* glsl */ `
			uniform float uTime;
			attribute vec4 aFrom, aTo; // the tie's Bezier points
			attribute vec2 aTimes;     // start, end
			attribute vec4 aLook;      // colour, weight
			varying vec3 vColour;
			const float DRAIN = ${DRAIN.toFixed(4)};
			const float SIZE = ${BALL.toFixed(4)}, LIFT = ${INK.toFixed(4)}, GLOW = ${COMET_GLOW.toFixed(4)};
			const vec3 CORE = vec3(${CORE.toArray().map((c) => c.toFixed(4))});
			${TIE}

			void main() {
				float start = aTimes.x, end = aTimes.y;
				float u = clamp((uTime - start) / (end - start), 0.0, 1.0);
				// sinks into the head it reached as the head fills
				float size = step(start, uTime) * (1.0 - clamp((uTime - end) / DRAIN, 0.0, 1.0));
				vec3 centre = vec3(bezier(aFrom, aTo, u), LIFT);
				vec3 p = centre + position * SIZE * (0.7 + 0.6 * aLook.w) * size;
				// white-hot where it faces the camera, the note's colour round its rim
				float facing = abs(dot(position, normalize(cameraPosition - centre)));
				vColour = mix(aLook.rgb, CORE, facing * facing) * GLOW;
				gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vColour;
			void main() { gl_FragColor = vec4(vColour, 1.0); }`,
		depthTest: false
	});
}

/** A tilted ellipse over each printed head: struck ones carry the time their comet lands, held ones (a tied note
 * ringing on) the time the music reaches them. */
function headGeometry({ flights, held }: Prepared, looks: Look[]) {
	const heads = [
		...flights.map(([note, , land, , , tx, ty]) => [note, land, tx, ty, 1]),
		...held.map(([note, t, x, y]) => [note, t, x, y, 0])
	];
	const per = HEAD_SEGMENTS + 1;
	const position = new Float32Array(heads.length * per * 3);
	const hit = new Float32Array(heads.length * per);
	const struck = new Float32Array(heads.length * per);
	const rim = new Float32Array(heads.length * per); // 0 at the centre vertex, 1 round the edge
	const across = new Float32Array(heads.length * per); // along the head's long axis, -1 at its left end to 1
	const look = new Float32Array(heads.length * per * 4);
	const index: number[] = [];
	const [rx, ry] = HEAD_RADII;
	const [cos, sin] = [Math.cos(HEAD_TILT), Math.sin(HEAD_TILT)];
	heads.forEach(([note, land, tx, ty, flash], f) => {
		const first = f * per;
		position.set([tx, ty, INK + 0.004], first * 3);
		for (let i = 0; i < HEAD_SEGMENTS; i++) {
			const a = (2 * Math.PI * i) / HEAD_SEGMENTS;
			const [x, y] = [rx * Math.cos(a), ry * Math.sin(a)];
			position.set([tx + x * cos - y * sin, ty + x * sin + y * cos, INK + 0.004], (first + 1 + i) * 3);
			across[first + 1 + i] = Math.cos(a);
			index.push(first, first + 1 + i, first + 1 + ((i + 1) % HEAD_SEGMENTS));
		}
		hit.fill(land, first, first + per);
		rim.fill(1, first + 1, first + per);
		struck.fill(flash, first, first + per);
		const { colour, weight } = looks[note];
		for (let v = first; v < first + per; v++) look.set([colour.r, colour.g, colour.b, weight], v * 4);
	});
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(position, 3));
	g.setAttribute('aHit', new THREE.BufferAttribute(hit, 1));
	g.setAttribute('aStruck', new THREE.BufferAttribute(struck, 1));
	g.setAttribute('aRim', new THREE.BufferAttribute(rim, 1));
	g.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
	g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
	g.setIndex(index);
	return g;
}

function headMaterial({ settings }: Prepared, time: { value: number }) {
	return new THREE.ShaderMaterial({
		uniforms: { uTime: time, uFrame: { value: 1 / settings.fps } },
		vertexShader: /* glsl */ `
			attribute float aHit, aStruck, aRim, aAcross;
			attribute vec4 aLook;
			varying float vHit, vStruck, vRim, vAcross;
			varying vec4 vLook;
			void main() {
				vRim = aRim;
				vAcross = aAcross;
				vHit = aHit;
				vStruck = aStruck;
				vLook = aLook;
				gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform float uTime, uFrame;
			varying float vHit, vStruck, vRim, vAcross;
			varying vec4 vLook;
			const vec3 CORE = vec3(${CORE.toArray().map((c) => c.toFixed(4))});
			const float FLASH = ${FLASH.toFixed(4)}, SUSTAIN = ${SUSTAIN.toFixed(4)}, SETTLE = ${SETTLE.toFixed(4)};
			const float FILL = ${FILL.toFixed(4)}, EMBER = ${EMBER.toFixed(4)};
			${COOLING}
			void main() {
				// the glow keys in lights.py, then cooling. Struck: dark until a frame before the hit, a flash as heavy
				// as the note, settling to a steady glow. Held: once the music reaches it, filling with the steady glow
				// from its left, the side its tie comes in, as the ball rolling along sinks into it. Both then cool to
				// an ember and fade back to ink.
				float t = uTime - vHit;
				float flash = FLASH * (0.5 + vLook.w);
				float steady = cooling(t);
				float front = mix(-1.3, 1.3, clamp(t / FILL, 0.0, 1.0));
				float glow = vStruck < 0.5 ? steady * (1.0 - smoothstep(front - 0.3, front + 0.3, vAcross))
					: t < -uFrame ? 0.0
					: t < 0.0 ? flash * (t + uFrame) / uFrame
					: t < SETTLE ? mix(flash, SUSTAIN, t / SETTLE)
					: steady;
				// a white-hot spot in the middle, the note's colour all round it, shrinking away as the head cools to an
				// ember: only the note's colour is left to fade
				float hot = clamp((glow - EMBER) / (SUSTAIN - EMBER), 0.0, 1.0);
				float core = 1.0 - smoothstep(0.0, max(0.45 * hot, 1e-3), vRim);
				gl_FragColor = vec4(vec3(0.01) + mix(vLook.rgb, CORE, core) * glow, 1.0);
			}`
	});
}
