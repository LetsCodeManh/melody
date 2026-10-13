/** A song as prepare.py writes it, in page units (staff spaces, y up) and seconds from the first note. */
export interface Prepared {
	page: { box: number };
	end: number;
	/** note, launch, land, origin x, origin y, target x, target y */
	flights: [number, number, number, number, number, number, number][];
	/** note, time, x, y: the heads a note is tied on to, lit when the music reaches them */
	held: [number, number, number, number][];
	/** one sample per frame from -lead: the page x looked at, and how far back the camera stands (1 = nearest) */
	camera: { centre: number[]; back: number[] };
	settings: {
		fps: number;
		lead: number;
		staffMid: number;
		camera: [number, number, number];
		lamp: [number, number, number];
		arc: number;
		maxArc: number;
	};
}

/** Where the camera looks and how far back it stands at song time t, between the per-frame samples. */
export function framingAt({ camera, settings }: Prepared, t: number): { centre: number; back: number } {
	const last = camera.centre.length - 1;
	const at = Math.min(Math.max((t + settings.lead) * settings.fps, 0), last);
	const i = Math.min(Math.floor(at), last - 1);
	const u = at - i;
	const mix = (v: number[]) => v[i] + (v[i + 1] - v[i]) * u;
	return { centre: mix(camera.centre), back: mix(camera.back) };
}

/** Song time from the first frame to the last. */
export const duration = ({ camera, settings }: Prepared) => ({
	start: -settings.lead,
	end: (camera.centre.length - 1) / settings.fps - settings.lead
});
