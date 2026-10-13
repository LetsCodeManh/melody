import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLights, type Lights } from './lights';
import { createPulse, noteLooks } from './looks';
import { framingAt, INK, type Prepared } from './melody';
import { createPaper } from './paper';
import { scoreGeometry } from './score';

/** Blender's 50 mm lens on its 36 mm sensor: the width it shows is what settings.SHOT was measured with. */
const HORIZONTAL_FOV = 2 * Math.atan(18 / 50);
// a dim, neutral light high over the point looked at, falling off into the dark: the lit heads' pools do the real
// lighting
const FILL = new THREE.Color(0.9, 0.92, 1.0);
const FILL_POWER = 30; // candela
const FILL_AT = new THREE.Vector3(-3, 0, 10); // from the point looked at
// as the camera backs off, the fill rises (its pool widens) by this power of how far back: part way, so a wide shot
// shows more of the score lit while the dark still closes in round it
const FILL_SPREAD = 0.6;
const BLOOM = 0.25;
// how much the fill and the glow swell as the music lands: the room breathes with it
const FILL_SWELL = 0.4; // share of FILL_POWER
const BLOOM_SWELL = 0.3;
const INK_COLOUR = new THREE.Color(0.006, 0.006, 0.006);

export interface Stage {
	/** Shows a song: its score on the paper, its comets and heads. */
	show(song: Prepared, svg: string): void;
	dispose(): void;
}

/** The melody on the page, live: the score on paper, the comets, a dim fill light and the low camera following the music,
 * as built by blender/melody-bounce/build.py. Coordinates are page units (staff spaces), z up, as in Blender.
 * time() is the song time to draw each frame. */
export function createStage(host: HTMLElement, time: () => number): Stage {
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.AgXToneMapping; // as in the Blender render
	host.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0, 0, 0);
	const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 3000);
	camera.up.set(0, 0, 1);
	const fill = new THREE.PointLight(FILL, FILL_POWER, 0, 2);
	scene.add(fill);
	const paper = createPaper(renderer.capabilities.getMaxAnisotropy());
	// glossy, as printing ink dries: its chamfered edges catch the fill and the glows
	const ink = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: INK_COLOUR, roughness: 0.3 }));
	scene.add(paper.mesh, ink);
	const overlay = new THREE.Scene(); // the comets, after the depth of field
	let song: Prepared | undefined;
	let lights: Lights | undefined;
	let pulse = (_t: number) => 0;

	// MSAA on the composer's buffers: the staff lines are thin
	const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
	const composer = new EffectComposer(renderer, target);
	composer.addPass(new RenderPass(scene, camera));
	const focus = new BokehPass(scene, camera, { focus: 30, aperture: 0.00025, maxblur: 0.004 });
	composer.addPass(focus);
	const comets = new RenderPass(overlay, camera);
	comets.clear = false;
	composer.addPass(comets);
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0, 1.2);
	// a glow hugging the lights, as Blender's: the widest blurs would spread hundreds of lit heads into a haze
	bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.45, 0.08, 0.01, 0.0];
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	const buffer = new THREE.Vector2();
	const resize = () => {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h);
		composer.setSize(w, h);
		camera.aspect = w / h;
		// keep Blender's horizontal view whatever the window's shape, so every comet the framing allows for is in shot
		camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HORIZONTAL_FOV / 2) / camera.aspect));
		camera.updateProjectionMatrix();
		lights?.setViewHeight(renderer.getDrawingBufferSize(buffer).y);
	};
	const observer = new ResizeObserver(resize);
	observer.observe(host);
	resize();

	const offset = new THREE.Vector3();
	renderer.setAnimationLoop(() => {
		if (!song || !lights) return;
		const t = time();
		const { settings } = song;
		const { centre, back } = framingAt(song, t);
		// camera and fill ride along with the point looked at (build.follow); the camera backs off along its view
		offset.fromArray(settings.camera).multiplyScalar(back);
		camera.position.set(centre, settings.staffMid, 0).add(offset);
		camera.lookAt(centre, settings.staffMid, 0);
		(focus.uniforms as { focus: { value: number } }).focus.value = offset.length();
		const spread = back ** FILL_SPREAD;
		fill.position.set(centre, settings.staffMid, 0).addScaledVector(FILL_AT, spread);
		const swell = pulse(t);
		// spread squared: as bright where it falls straight down, however high it rises
		fill.intensity = FILL_POWER * spread * spread * (1 + FILL_SWELL * swell);
		bloom.strength = BLOOM + BLOOM_SWELL * swell;
		lights.setTime(t);
		composer.render();
	});

	return {
		show(next, svg) {
			song = next;
			ink.geometry.dispose();
			ink.geometry = scoreGeometry(svg, INK);
			paper.fit(next.page.box);
			if (lights) {
				scene.remove(lights.paper);
				overlay.remove(lights.overlay);
				lights.dispose();
			}
			const looks = noteLooks(next);
			lights = createLights(next, looks);
			lights.setViewHeight(renderer.getDrawingBufferSize(buffer).y);
			pulse = createPulse(next, looks);
			scene.add(lights.paper);
			overlay.add(lights.overlay);
		},
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			lights?.dispose();
			paper.dispose();
			ink.geometry.dispose();
			ink.material.dispose();
			focus.dispose();
			bloom.dispose();
			composer.dispose();
			target.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}
