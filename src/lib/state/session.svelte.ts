/**
 * Session state: the caller's key, their model choice, and which character is
 * on screen. The key lives in localStorage on the user's own machine and is
 * sent as a request header when a turn needs it. It is never persisted server
 * side, and "Forget key" really does remove it.
 */

import { browser } from '$app/environment';
import { DEFAULT_MODEL } from '$lib/harness';
import { describeError, listModels } from '$lib/client/openai';
import { isCharacterId, type CharacterId } from '$lib/voices';

const KEY_STORAGE = 'regassist.openai-key';
const MISTRAL_STORAGE = 'regassist.mistral-key';
const MODEL_STORAGE = 'regassist.model';
const CHARACTER_STORAGE = 'regassist.character';
/** Read by the inline script in app.html too — keep the name in step. */
const THEME_STORAGE = 'regassist.theme';

function read(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		// Private mode, or storage disabled. Not worth failing over.
		return null;
	}
}

function write(key: string, value: string | null): void {
	if (!browser) return;
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Ignore: the session still works, it just will not be remembered.
	}
}

export type Theme = 'light' | 'dark';

/**
 * What the page is wearing right now.
 *
 * Stored only once the reader has actually chosen. Until then it follows the
 * system, and keeps following it — someone whose machine turns dark at sunset
 * should not have to come back and press a button.
 */
function storedTheme(): Theme | null {
	const value = read(THEME_STORAGE);
	return value === 'light' || value === 'dark' ? value : null;
}

function systemTheme(): Theme {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

class SessionState {
	apiKey = $state<string>(read(KEY_STORAGE) ?? '');
	/**
	 * Optional second key, for reading a PDF.
	 *
	 * Highlighting a passage on the page needs to know where on the page it is,
	 * which OpenAI's models do not report. Mistral's OCR does, so a document
	 * with a text layer works without this and a scan or a highlighted overlay
	 * needs it. Kept separate so the app is honest about which key buys what.
	 */
	mistralKey = $state<string>(read(MISTRAL_STORAGE) ?? '');
	model = $state<string>(read(MODEL_STORAGE) ?? DEFAULT_MODEL);
	character = $state<CharacterId>(
		isCharacterId(read(CHARACTER_STORAGE)) ? (read(CHARACTER_STORAGE) as CharacterId) : 'classic'
	);

	theme = $state<Theme>(storedTheme() ?? systemTheme());
	/** True while the theme is whatever the system says, rather than a choice. */
	followsSystem = $state(storedTheme() === null);

	availableModels = $state<string[]>([]);
	realtimeAvailable = $state(true);
	verifying = $state(false);
	keyError = $state<string | null>(null);

	readonly hasKey = $derived(this.apiKey.trim().length > 0);
	readonly canOcr = $derived(this.mistralKey.trim().length > 0);

	setKey(value: string): void {
		this.apiKey = value.trim();
		write(KEY_STORAGE, this.apiKey || null);
	}

	forgetKey(): void {
		this.apiKey = '';
		this.availableModels = [];
		this.keyError = null;
		write(KEY_STORAGE, null);
	}

	forgetMistralKey(): void {
		this.mistralKey = '';
		write(MISTRAL_STORAGE, null);
	}

	setMistralKey(value: string): void {
		this.mistralKey = value.trim();
		write(MISTRAL_STORAGE, this.mistralKey || null);
	}

	setModel(value: string): void {
		this.model = value;
		write(MODEL_STORAGE, value);
	}

	setCharacter(value: CharacterId): void {
		this.character = value;
		write(CHARACTER_STORAGE, value);
	}

	/** Take the other one, and stop following the system from here on. */
	toggleTheme(): void {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
		this.followsSystem = false;
		write(THEME_STORAGE, this.theme);
	}

	/** The system changed its mind, and we are still listening. */
	systemThemeChanged(theme: Theme): void {
		if (this.followsSystem) this.theme = theme;
	}

	/**
	 * Confirm the key works and find out what it can reach. Returns true when
	 * the key is usable, so the gate can advance on success only.
	 */
	async verify(key = this.apiKey): Promise<boolean> {
		const candidate = key.trim();
		if (!candidate) {
			this.keyError = 'Enter your OpenAI API key to begin.';
			return false;
		}

		this.verifying = true;
		this.keyError = null;
		try {
			const payload = await listModels(candidate);
			this.availableModels = payload.models;
			this.realtimeAvailable = payload.realtimeAvailable;
			if (!payload.models.includes(this.model)) this.setModel(payload.defaultModel);
			this.setKey(candidate);
			return true;
		} catch (cause) {
			// The key itself is the only credential in play, so a rejection is
			// about the key rather than about reaching anything.
			const message = describeError(cause);
			this.keyError = /401|unauthor|invalid.*key/i.test(message)
				? 'That key was rejected by OpenAI.'
				: `Could not check that key. ${message}`;
			return false;
		} finally {
			this.verifying = false;
		}
	}
}

export const session = new SessionState();
