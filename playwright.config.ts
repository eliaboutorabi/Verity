import { defineConfig } from '@playwright/test';

/*
 * Against a local preview by default, or against an already-running site when
 * one is named.
 *
 * The second form is how the Pages build gets checked: the same suite, run
 * against the same artefact the workflow uploads, served from the same
 * subdirectory Pages serves it from. Every `goto` is relative so the base URL
 * can carry that subdirectory.
 */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
	testMatch: '**/*.e2e.{ts,js}',
	use: external ? { baseURL: external } : undefined,
	webServer: external ? undefined : { command: 'npm run build && npm run preview', port: 4173 }
});
