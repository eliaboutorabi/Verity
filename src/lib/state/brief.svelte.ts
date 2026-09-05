/**
 * The thing you take away.
 *
 * An answer scrolls off the top of a thread. This is what survives it: what
 * needs acting on, what it rests on, and what she could not settle. She writes
 * to it while she works, in either mode, so a conversation ends with a
 * deliverable rather than a transcript to re-read.
 */

import type { BriefEntry } from '$lib/harness';

export interface BriefItem extends BriefEntry {
	id: string;
	done: boolean;
}

const RANK: Record<BriefEntry['severity'], number> = { high: 0, medium: 1, low: 2, info: 3 };

let counter = 0;

class BriefState {
	items = $state<BriefItem[]>([]);

	readonly findings = $derived(
		this.items
			.filter((item) => item.kind === 'finding')
			.sort((a, b) => RANK[a.severity] - RANK[b.severity])
	);
	readonly gaps = $derived(this.items.filter((item) => item.kind === 'gap'));
	readonly isEmpty = $derived(this.items.length === 0);
	readonly outstanding = $derived(this.items.filter((item) => !item.done).length);

	/**
	 * Add entries she has decided on.
	 *
	 * Deduplicated by topic: a long conversation revisits the same issue, and a
	 * brief that lists worker classification four times is not a brief.
	 */
	add(entries: BriefEntry[]): void {
		for (const entry of entries) {
			const key = entry.topic.trim().toLowerCase();
			const existing = this.items.find(
				(item) => item.kind === entry.kind && item.topic.trim().toLowerCase() === key
			);

			if (existing) {
				// A later pass usually knows more; keep the newer wording and the
				// higher severity.
				existing.detail = entry.detail;
				existing.citation = entry.citation ?? existing.citation;
				if (RANK[entry.severity] < RANK[existing.severity]) existing.severity = entry.severity;
				continue;
			}

			this.items.push({ ...entry, id: `b${(counter += 1)}`, done: false });
		}
	}

	toggle(id: string): void {
		const item = this.items.find((candidate) => candidate.id === id);
		if (item) item.done = !item.done;
	}

	remove(id: string): void {
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear(): void {
		this.items = [];
	}

	/** The brief as a memo, for pasting into whatever it has to go into. */
	asMarkdown(title = 'Regulatory review'): string {
		const lines = [`# ${title}`, '', `_Prepared with Verity on ${new Date().toLocaleDateString()}._`];

		if (this.findings.length) {
			lines.push('', '## Points to act on', '');
			for (const item of this.findings) {
				const mark = item.done ? 'x' : ' ';
				const cite = item.citation ? ` — ${item.citation}` : '';
				lines.push(`- [${mark}] **${item.topic}**${cite}`, `      ${item.detail}`);
			}
		}

		if (this.gaps.length) {
			lines.push('', '## Open questions', '');
			for (const item of this.gaps) lines.push(`- **${item.topic}**`, `      ${item.detail}`);
		}

		lines.push(
			'',
			'---',
			'',
			'Research assistance, not a tax opinion. Every citation was read in the current',
			'Code of Federal Regulations at the time of writing.'
		);
		return lines.join('\n');
	}
}

export const brief = new BriefState();
