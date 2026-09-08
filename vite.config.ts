import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	ssr: {
		noExternal: [
			// Ships raw .svelte files; Vite must compile it rather than hand it to
			// Node's ESM loader, which has no idea what a .svelte file is.
			'@hugeicons/svelte',
			// Same reason: the animated icons ship as .svelte sources.
			'@jis3r/icons'
		]
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			/*
			 * A static site, because there is nothing left for a server to do.
			 *
			 * Every upstream the app talks to answers a cross-origin request, and
			 * the agent loop is plain fetch-driven TypeScript, so the five routes
			 * that used to proxy them are gone and the whole thing is one page of
			 * HTML plus its assets. That is what makes GitHub Pages a real host for
			 * it rather than a place to park a landing page — and it is the honest
			 * version of bring-your-own-key, because there is no longer a server
			 * for the key to pass through.
			 */
			adapter: adapter({ fallback: '404.html' }),
			/*
			 * Pages serves a project site from a subdirectory, so every asset URL
			 * has to carry it. Empty everywhere else, which is what dev and the
			 * end-to-end run want.
			 */
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
