import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLights, COLOUR, INK, type Lights } from './lights';
import { framingAt, type Prepared } from './melody';
import { scoreGeometry } from './score';

/** Blender's 50 mm lens on its 36 mm sensor: the width it shows is what settings.SHOT was measured with. */
const HORIZONTAL_FOV = 2 * Math.atan(18 / 50);
const LAMP_POWER = 70; // candela, at staff-space distances: tuned against the Blender stills
const PAPER = new THREE.Color(0.78, 0.75, 0.7);
const INK_COLOUR = new THREE.Color(0.008, 0.008, 0.008);

export interface Stage {
	/** Shows a song: its score on the paper, its comets and heads. */
	show(song: Prepared, svg: string): void;
	dispose(): void;
}

/** The melody on the page, live: the score on paper, the comets, a warm lamp and the low camera following the music,
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
	const lamp = new THREE.PointLight(COLOUR, LAMP_POWER, 0, 2);
	scene.add(lamp);
	const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.65 }));
	const ink = new THREE.Mesh(
		new THREE.BufferGeometry(),
		new THREE.MeshStandardMaterial({ color: INK_COLOUR, roughness: 0.6, side: THREE.DoubleSide })
	);
	ink.position.z = INK;
	scene.add(paper, ink);
	const overlay = new THREE.Scene(); // the comets, after the depth of field
	let song: Prepared | undefined;
	let lights: Lights | undefined;

	// MSAA on the composer's buffers: the staff lines are thin
	const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
	const composer = new EffectComposer(renderer, target);
	composer.addPass(new RenderPass(scene, camera));
	const focus = new BokehPass(scene, camera, { focus: 30, aperture: 0.001, maxblur: 0.012 });
	composer.addPass(focus);
	const comets = new RenderPass(overlay, camera);
	comets.clear = false;
	composer.addPass(comets);
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0, 1.2);
	// a glow hugging the lights, as Blender's: the widest blurs would spread hundreds of lit heads into a haze
	bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.6, 0.15, 0.03, 0.0];
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	const resize = () => {
		const { clientWidth: w, clientHeight: h } = host;
		if (!w || !h) return;
		renderer.setSize(w, h);
		composer.setSize(w, h);
		camera.aspect = w / h;
		// keep Blender's horizontal view whatever the window's shape, so every comet the framing allows for is in shot
		camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HORIZONTAL_FOV / 2) / camera.aspect));
		camera.updateProjectionMatrix();
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
		// camera and lamp ride along with the point looked at (build.follow); the camera backs off along its view
		offset.fromArray(settings.camera).multiplyScalar(back);
		camera.position.set(centre, settings.staffMid, 0).add(offset);
		camera.lookAt(centre, settings.staffMid, 0);
		(focus.uniforms as { focus: { value: number } }).focus.value = offset.length();
		lamp.position.set(centre + settings.lamp[0], settings.staffMid + settings.lamp[1], settings.lamp[2]);
		lights.setTime(t);
		composer.render();
	});

	return {
		show(next, svg) {
			song = next;
			ink.geometry.dispose();
			ink.geometry = scoreGeometry(svg);
			// the paper reaches well past the score and behind it, into the dark (build.paper)
			const length = next.page.box;
			paper.scale.set(length + 120, 320, 1);
			paper.position.set(length / 2, 80, 0);
			if (lights) {
				scene.remove(lights.heads);
				overlay.remove(lights.comets);
				lights.dispose();
			}
			lights = createLights(next);
			scene.add(lights.heads);
			overlay.add(lights.comets);
		},
		dispose() {
			renderer.setAnimationLoop(null);
			observer.disconnect();
			lights?.dispose();
			for (const m of [paper, ink]) {
				m.geometry.dispose();
				m.material.dispose();
			}
			focus.dispose();
			bloom.dispose();
			composer.dispose();
			target.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		}
	};
}
