/**
 * What Verity has read of a document, and what she is pointing at.
 *
 * Two ways to find out where a passage sits, tried in that order.
 *
 * A PDF with a text layer already knows where it drew every word, so its own
 * geometry is read in the browser: free, exact, and available to everybody.
 * This used to be a *refinement* on top of OCR, which meant marking a document
 * required a second provider's key — and without one the feature did not
 * degrade, it silently did not exist. Someone who had never pasted a Mistral
 * key had no way to discover the app could point at anything at all.
 *
 * OCR is the fallback, for the scans that genuinely have no text to read. It
 * still costs a call to a second provider, so it happens only when the first
 * route comes back empty.
 *
 * Neither runs on upload: most questions never need either.
 */

import { locateQuote, type BlockMatch, type OcrPageView } from '$lib/ocr-match';
import { pdfPageBlocks } from '$lib/client/pdf';
import { runOcr } from '$lib/ocr-service';
import { documents } from './documents.svelte';
import { session } from './session.svelte';

export type ReadStatus = 'idle' | 'reading' | 'ready' | 'error';

export interface Highlight {
	id: string;
	documentId: string;
	quote: string;
	/** Why it is highlighted — shown on the marker. */
	note: string;
	severity: 'high' | 'medium' | 'low' | 'info';
}

interface DocumentRead {
	status: ReadStatus;
	pages: OcrPageView[];
	error: string | null;
	/** Which route produced the geometry, for anything that wants to say. */
	source?: 'pdf' | 'ocr';
}

let counter = 0;

class PagesState {
	reads = $state<Record<string, DocumentRead>>({});
	highlights = $state<Highlight[]>([]);
	/** The highlight the viewer should scroll to, and a nonce so a repeat click still moves. */
	focus = $state<{ id: string; nonce: number } | null>(null);

	status(documentId: string): ReadStatus {
		return this.reads[documentId]?.status ?? 'idle';
	}

	pages(documentId: string): OcrPageView[] {
		return this.reads[documentId]?.pages ?? [];
	}

	error(documentId: string): string | null {
		return this.reads[documentId]?.error ?? null;
	}

	forDocument(documentId: string): Highlight[] {
		return this.highlights.filter((highlight) => highlight.documentId === documentId);
	}

	/**
	 * Run OCR over a document, once.
	 *
	 * Returns true when geometry is available afterwards, so a caller that
	 * needs boxes can tell the difference between "read it" and "cannot".
	 */
	async read(documentId: string): Promise<boolean> {
		const existing = this.reads[documentId];
		if (existing?.status === 'ready') return true;
		if (existing?.status === 'reading') return false;

		const document = documents.get(documentId);
		if (!document?.file) return false;

		this.reads = { ...this.reads, [documentId]: { status: 'reading', pages: [], error: null } };

		// The document's own text layer first. Most documents have one, and it
		// is more accurate than anything read off a picture of the page.
		if (document.mimeType === 'application/pdf' || /\.pdf$/i.test(document.name)) {
			try {
				const pages = await pdfPageBlocks(document.file);
				if (pages.some((page) => page.blocks.length)) {
					this.reads = {
						...this.reads,
						[documentId]: {
							status: 'ready',
							source: 'pdf',
							error: null,
							pages: pages.map((page) => ({
								index: page.index,
								width: page.width,
								height: page.height,
								markdown: '',
								blocks: page.blocks.map((block) => ({ type: 'text', ...block }))
							}))
						}
					};
					return true;
				}
			} catch {
				// A PDF we cannot parse is a case for OCR, not an error yet.
			}
		}

		if (!session.canOcr) {
			this.reads = {
				...this.reads,
				[documentId]: {
					status: 'error',
					pages: [],
					error:
						'This looks like a scan, with no text layer to read positions from. Add a Mistral key in settings and she can read the page itself.'
				}
			};
			return false;
		}

		try {
			const bytes = new Uint8Array(await document.file.arrayBuffer());
			const result = await runOcr(
				session.mistralKey,
				bytes,
				document.mimeType || 'application/pdf',
				document.name
			);

			// Only what the viewer draws with: page shape, and the boxes plus the
			// text inside them. The rest of Mistral's payload is not ours to keep.
			const pages: OcrPageView[] = result.pages.map((page) => ({
				index: page.index,
				width: page.dimensions?.width ?? null,
				height: page.dimensions?.height ?? null,
				markdown: page.markdown,
				blocks: (page.blocks ?? []).map((block) => ({
					type: block.type,
					content: block.content,
					x: block.top_left_x,
					y: block.top_left_y,
					width: block.bottom_right_x - block.top_left_x,
					height: block.bottom_right_y - block.top_left_y
				}))
			}));

			this.reads = {
				...this.reads,
				[documentId]: { status: 'ready', source: 'ocr', pages, error: null }
			};
			return true;
		} catch (cause) {
			this.reads = {
				...this.reads,
				[documentId]: {
					status: 'error',
					pages: [],
					error: cause instanceof Error ? cause.message : 'That document could not be read.'
				}
			};
			return false;
		}
	}

	/** Point at a passage. Replaces any existing highlight of the same quote. */
	add(
		documentId: string,
		quote: string,
		note: string,
		severity: Highlight['severity'] = 'info'
	): Highlight {
		const trimmed = quote.trim();
		const existing = this.highlights.find(
			(highlight) => highlight.documentId === documentId && highlight.quote === trimmed
		);
		if (existing) {
			existing.note = note;
			existing.severity = severity;
			return existing;
		}

		const highlight: Highlight = {
			id: `hl${(counter += 1)}`,
			documentId,
			quote: trimmed,
			note,
			severity
		};
		this.highlights.push(highlight);
		return highlight;
	}

	/** Where a highlight lands on the page, or nothing when it cannot be placed. */
	locate(highlight: Highlight): BlockMatch[] {
		return locateQuote(highlight.quote, this.pages(highlight.documentId));
	}

	reveal(id: string): void {
		this.focus = { id, nonce: (this.focus?.nonce ?? 0) + 1 };
	}

	clear(): void {
		this.reads = {};
		this.highlights = [];
		this.focus = null;
	}
}

export const pages = new PagesState();
