/**
 * The one place that opens a PDF in the browser.
 *
 * pdf.js needs two directories of runtime data it does not bundle:
 * `standard_fonts` for base-14 faces a PDF references without embedding, and
 * `cmaps` for the predefined CJK encodings. It fetches them at render time,
 * and a fetch that 404s does not raise — the worker's font promise simply
 * never settles, so `page.render()` neither resolves nor rejects and the
 * canvas stays blank with nothing to catch. The default URLs resolve through
 * Vite's node_modules passthrough in dev and point at nothing in a build, so
 * the failure would only ever appear in production. `npm run sync:pdfjs`
 * copies both directories into `static/pdfjs/`.
 *
 * `renderPage` puts a deadline on the render as a backstop for the same class
 * of failure: a missing asset should reach the reader as an error, not as a
 * white page that never finishes.
 *
 * (Carried over from the Rowbot codebase, where both problems were found.)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TextRun {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

let loading: Promise<any> | null = null;

async function pdfjs(): Promise<any> {
	loading ??= (async () => {
		const lib = await import('pdfjs-dist');
		const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
		lib.GlobalWorkerOptions.workerSrc = worker.default;
		return lib;
	})();
	return loading;
}

export async function openDocument(url: string): Promise<any> {
	const lib = await pdfjs();
	return lib.getDocument({
		url,
		standardFontDataUrl: '/pdfjs/standard_fonts/',
		cMapUrl: '/pdfjs/cmaps/',
		cMapPacked: true
	}).promise;
}

/** Long enough for a dense page on a slow machine, short enough to notice. */
const RENDER_TIMEOUT_MS = 20_000;

/**
 * A deadline that only counts down while the tab is on screen.
 *
 * pdf.js loads fonts through a `requestAnimationFrame` poll, and a browser
 * stops serving those to a hidden tab — so a render started in a background
 * tab does not progress until you come back to it. A plain `setTimeout` would
 * expire during that pause and cancel a render that was never given a chance,
 * leaving a permanently broken preview behind for anyone who opened the app in
 * a background tab. Wall-clock is the wrong clock here; visible time is the
 * one that matches what pdf.js is waiting on.
 */
function visibleDeadline(ms: number, onExpiry: () => void): () => void {
	let remaining = ms;
	let startedAt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const stop = () => {
		if (timer === null) return;
		clearTimeout(timer);
		timer = null;
		remaining -= Date.now() - startedAt;
	};

	const start = () => {
		if (timer !== null || remaining <= 0) return;
		startedAt = Date.now();
		timer = setTimeout(onExpiry, remaining);
	};

	const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

	document.addEventListener('visibilitychange', onVisibility);
	onVisibility();

	return () => {
		stop();
		document.removeEventListener('visibilitychange', onVisibility);
	};
}

export async function renderPage(
	page: any,
	canvas: HTMLCanvasElement,
	context: CanvasRenderingContext2D,
	viewport: any
): Promise<void> {
	const task = page.render({ canvas, canvasContext: context, viewport });
	let cancelDeadline = () => {};
	const expiry = new Promise<never>((_, reject) => {
		cancelDeadline = visibleDeadline(RENDER_TIMEOUT_MS, () => {
			task.cancel();
			reject(new Error('That page took too long to draw.'));
		});
	});
	try {
		await Promise.race([task.promise, expiry]);
	} finally {
		cancelDeadline();
	}
}

/**
 * Every run of text on a page, in a target coordinate space.
 *
 * This is what makes a mark land on the sentence rather than near it. Mistral
 * segments a numbered list as one block and reports one box for all of it, but
 * the PDF itself knows exactly where it drew every word, and pdf.js will say.
 * Scaling into the caller's space here rather than at the call site keeps the
 * two coordinate systems from ever being mixed up downstream.
 *
 * A scanned page has no text layer and returns nothing. That is not a failure;
 * it is the case the caller falls back for.
 *
 * (Carried over from the Rowbot codebase.)
 */
export async function pageTextRuns(
	doc: any,
	pageNumber: number,
	target: { width: number; height: number }
): Promise<TextRun[]> {
	const page = await doc.getPage(pageNumber);
	const viewport = page.getViewport({ scale: 1 });
	const content = await page.getTextContent();

	const sx = target.width / viewport.width;
	const sy = target.height / viewport.height;

	return content.items
		.filter((item: any) => typeof item.str === 'string' && item.str.trim() !== '')
		.map((item: any) => {
			const height = item.height || 0;
			return {
				text: item.str,
				x: item.transform[4] * sx,
				// PDF measures up from the foot of the page; everything else here
				// measures down from the head of it.
				y: (viewport.height - item.transform[5] - height) * sy,
				width: (item.width || 0) * sx,
				height: height * sy
			};
		});
}

/**
 * The page geometry a PDF already carries, as blocks the matcher can search.
 *
 * Marking a passage on the page used to need a second provider: Mistral read
 * the document, reported a box per block, and the text layer was used only to
 * narrow that box to a sentence. Which meant that without a Mistral key the
 * feature did not degrade — it simply did not exist, and someone who had never
 * pasted a second key had no idea the app could do it at all.
 *
 * But the narrowing step was the tell. A PDF with a text layer knows exactly
 * where it drew every word, so for those — which is most documents anybody
 * sends an accountant — the geometry was already on the machine. OCR is the
 * fallback now, for the scans that genuinely have no text to read.
 *
 * Runs are grouped into lines by vertical proximity and lines into paragraphs
 * by the gap between them, because the matcher scores a quote against a block's
 * text: one block per word would match nothing, and one per page would point at
 * everything.
 */
export async function pdfPageBlocks(file: File): Promise<PdfPageBlocks[]> {
	const url = URL.createObjectURL(file);
	try {
		const doc = await openDocument(url);
		const pages: PdfPageBlocks[] = [];

		for (let number = 1; number <= doc.numPages; number += 1) {
			const page = await doc.getPage(number);
			const { width, height } = page.getViewport({ scale: 1 });
			const runs = await pageTextRuns(doc, number, { width, height });
			pages.push({ index: number - 1, width, height, blocks: blocksFrom(runs) });
		}

		return pages;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export interface PdfBlock {
	content: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PdfPageBlocks {
	index: number;
	width: number;
	height: number;
	blocks: PdfBlock[];
}

/** The union of two boxes. */
function merge(a: PdfBlock, b: PdfBlock): PdfBlock {
	const left = Math.min(a.x, b.x);
	const top = Math.min(a.y, b.y);
	return {
		content: `${a.content} ${b.content}`.trim(),
		x: left,
		y: top,
		width: Math.max(a.x + a.width, b.x + b.width) - left,
		height: Math.max(a.y + a.height, b.y + b.height) - top
	};
}

function blocksFrom(runs: TextRun[]): PdfBlock[] {
	if (!runs.length) return [];

	// Reading order: down the page, then across it.
	const ordered = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);

	const lines: PdfBlock[] = [];
	for (const run of ordered) {
		const current = lines[lines.length - 1];
		const box: PdfBlock = {
			content: run.text,
			x: run.x,
			y: run.y,
			width: run.width,
			height: run.height
		};
		// Same line when the baselines are within half a line of each other.
		const sameLine = current && Math.abs(run.y - current.y) <= Math.max(run.height, 1) * 0.6;
		if (sameLine) lines[lines.length - 1] = merge(current, box);
		else lines.push(box);
	}

	const paragraphs: PdfBlock[] = [];
	for (const line of lines) {
		const current = paragraphs[paragraphs.length - 1];
		// A gap wider than one and a half lines is a new paragraph. Anything
		// tighter is the same one wrapping.
		const gap = current ? line.y - (current.y + current.height) : Infinity;
		if (current && gap <= Math.max(line.height, 1) * 1.5) {
			paragraphs[paragraphs.length - 1] = merge(current, line);
		} else {
			paragraphs.push({ ...line });
		}
	}

	return paragraphs;
}
