/**
 * Trims the interview bank down to what the app actually uses.
 *
 * The bank as supplied is bilingual and carries provenance, tags and Persian
 * translations — 948 KB, most of which would ride into every server bundle for
 * no reason. This takes the English side and the five fields the drawing tool
 * reads, and writes the result next to the plugin that imports it.
 *
 *   node scripts/build-interview-bank.mjs
 *
 * The full bank stays in data/ as the source of truth, so a future edit is made
 * there and rebuilt rather than hand-patched in the generated file.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'data', 'interview-bank.json');
const target = join(root, 'src', 'lib', 'plugins', 'interview-bank.json');

const bank = JSON.parse(await readFile(source, 'utf8'));

const levels = Object.fromEntries(bank.levels.map((level) => [level.level, level.name.en]));

const questions = bank.questions
	.filter((question) => question.en?.question && question.en?.answer)
	.map((question) => ({
		slug: question.slug,
		level: question.level,
		topic: question.topic,
		difficulty: question.difficulty,
		question: question.en.question,
		answer: question.en.answer,
		// The first few talking points make good hints: each is a real step
		// toward the answer rather than a restatement of the question.
		hints: (question.en.talkingPoints ?? []).slice(0, 3),
		looksFor: question.en.interviewerLooksFor ?? ''
	}));

const trimmed = {
	title: bank.title,
	generatedAt: bank.generatedAt,
	levels,
	topics: [...new Set(questions.map((question) => question.topic))].sort(),
	questions
};

await writeFile(target, `${JSON.stringify(trimmed)}\n`);

const before = (await readFile(source)).length;
const after = (await readFile(target)).length;
console.log(
	`${questions.length} questions · ${trimmed.topics.length} topics · ` +
		`${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`
);
