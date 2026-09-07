import { expect, test } from '@playwright/test';
import { GOOD_KEY, highlightStream, questionStream, stubApi, unlock } from './fixtures.js';

// Each test gets a fresh browser context, so local storage starts empty
// without an init script — which would otherwise also wipe the key the
// "remembers it" test is reloading to check.
test.beforeEach(async ({ page }) => {
	await stubApi(page);
});

test.describe('the key gate', () => {
	test('meets a visitor with the robot, not a form', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByLabel('Verity, an animated calculator robot')).toBeVisible();
		await expect(page.getByRole('heading', { name: /runs on your OpenAI account/ })).toBeVisible();
	});

	test('reports a rejected key and stays put', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('OpenAI API key').fill('sk-wrongwrongwrongwrongwrongwrongwrong');
		await page.getByRole('button', { name: 'Start', exact: true }).click();

		await expect(page.getByRole('alert')).toContainText('rejected');
		await expect(page.getByLabel('OpenAI API key')).toBeVisible();
	});

	test('opens the app on a good key and remembers it', async ({ page }) => {
		await page.goto('/');
		await unlock(page);
		await expect(page.getByPlaceholder('Ask about a regulation…')).toBeVisible();

		await page.reload();
		await expect(page.getByRole('heading', { name: 'What are you checking?' })).toBeVisible();
	});

	test('hides the app controls until a key is entered', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Settings' })).toHaveCount(0);
		await unlock(page);
		await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
	});

	test('voice is disabled until a key is entered', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: /voice conversation/ })).toBeDisabled();
		await unlock(page);
		await expect(page.getByRole('button', { name: /voice conversation/ })).toBeEnabled();
	});
});

test.describe('the theme', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await unlock(page);
	});

	test('switches, sticks, and survives a reload', async ({ page }) => {
		// The head script resolved this before anything painted.
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

		const ground = await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()
		);
		expect(ground).toBe('#0b0e1e');

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByRole('button', { name: 'Switch to the light theme' })).toBeVisible();
	});

	test('follows the system until someone chooses', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.emulateMedia({ colorScheme: 'light' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

		// Once chosen, the system no longer gets a vote.
		await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
		await page.emulateMedia({ colorScheme: 'light' });
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	});
});

test.describe('a conversation', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await unlock(page);
	});

	test('renders the answer, a quiet card and the citation rail', async ({ page }) => {
		await page.getByLabel('Message Verity').fill('What substantiates travel?');
		await page.getByRole('button', { name: 'Send message' }).click();

		await expect(page.getByText('What substantiates travel?')).toBeVisible();

		// A search result is scaffolding: it collapses to one line so the answer
		// below it is the thing you read first.
		const card = page.locator('article.card');
		await expect(card).toHaveAttribute('data-state', 'done');
		await expect(card).toContainText('2 sections for “substantiation requirements”');
		await expect(card.locator('.hits')).toHaveCount(0);

		await expect(page.getByText(/You need the amount, time, place/)).toBeVisible();
		// Markdown is rendered rather than shown as asterisks.
		await expect(page.locator('.prose strong')).toContainText('26 CFR § 1.274-5');

		const rail = page.locator('.rail a');
		await expect(rail).toHaveCount(2);
		await expect(rail.first()).toHaveAttribute('href', /ecfr\.gov/);
	});

	test('a collapsed card opens on click and stays open', async ({ page }) => {
		await page.getByLabel('Message Verity').fill('What substantiates travel?');
		await page.getByRole('button', { name: 'Send message' }).click();

		const head = page.locator('button.head').first();
		await expect(head).toHaveAttribute('aria-expanded', 'false');
		await head.click();

		await expect(head).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('article.card .hits li')).toHaveCount(2);
		await expect(page.getByText('Substantiation requirements.')).toBeVisible();
	});

	test('what she is doing appears beside her, not in the conversation', async ({ page }) => {
		await page.getByLabel('Message Verity').fill('What substantiates travel?');
		await page.getByRole('button', { name: 'Send message' }).click();

		const doing = page.getByRole('region', { name: 'What Verity is doing' });
		await expect(doing).toContainText('Searching the eCFR');
		await expect(doing).toContainText('2 sections');
	});

	test('a starter card starts a turn', async ({ page }) => {
		await page.getByRole('button', { name: /Look up a rule/ }).click();
		await expect(page.locator('article.card')).toBeVisible();
	});

	test('an attachment on its own is a message', async ({ page }) => {
		const send = page.getByRole('button', { name: 'Send message' });
		await expect(send).toBeDisabled();

		// Attaching a document and pressing send means "look at this", which is
		// what anybody doing it intends — the box does not also need a sentence.
		await page.getByRole('button', { name: 'Engagement letter' }).click();
		await expect(page.locator('.chips li')).toHaveCount(1);
		await expect(send).toBeEnabled();

		await send.click();
		await expect(page.locator('.bubble')).toHaveText('Take a look at this.');
	});

	test('a marked-up document can be opened, and says so on the chip', async ({ page }) => {
		await page.getByRole('button', { name: 'Engagement letter' }).click();
		await expect(page.locator('.chips li')).toHaveCount(1);

		await page.route('**/api/chat', async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream' },
				body: highlightStream('engagement-letter-brightline.pdf')
			});
		});
		await page.getByLabel('Message Verity').fill('Mark up what worries you.');
		await page.getByRole('button', { name: 'Send message' }).click();

		// Marking a document with no way to see it is the same as not marking it.
		await expect(page.locator('.chip-marks')).toHaveText('1 marked');
		// A grid item's default min-width refuses to shrink below its contents, so
		// a row whose text will not wrap used to push out through the side of the
		// card. Everything inside is prepared to be clamped; the item has to let it.
		const overflow = await page.locator('.marks button').first().evaluate((el) => ({
			scroll: el.scrollWidth,
			client: el.clientWidth,
			cardRight: el.closest('article.card')!.getBoundingClientRect().right,
			rowRight: el.getBoundingClientRect().right
		}));
		expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
		expect(overflow.rowRight).toBeLessThanOrEqual(overflow.cardRight);

		await page.getByRole('button', { name: 'Open the document' }).click();
		await expect(page.locator('dialog[open]')).toBeVisible();
		await expect(page.locator('dialog[open]')).toContainText('engagement-letter-brightline.pdf');

		// Each page sizes itself from an aspect ratio, and a grid resolves a row's
		// height before that width is known — so every page got a row hundreds of
		// pixels shorter than itself and the next one landed on top of it.
		await expect(page.locator('dialog[open] .page')).toHaveCount(2);
		const stacked = await page.locator('dialog[open] .page').evaluateAll((els) =>
			els.map((el) => {
				const box = el.getBoundingClientRect();
				return { top: box.top, bottom: box.bottom };
			})
		);
		expect(stacked[1].top).toBeGreaterThanOrEqual(stacked[0].bottom);
	});

	test('a multiple-choice question is answered by clicking', async ({ page }) => {
		await page.route('**/api/chat', async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'Content-Type': 'text/event-stream' },
				body: questionStream()
			});
		});

		await page.getByLabel('Message Verity').fill('Quiz me.');
		await page.getByRole('button', { name: 'Send message' }).click();

		const choices = page.locator('.choices button');
		await expect(choices).toHaveCount(2);

		// Reading four options and then typing "B" is work the screen should do.
		await choices.nth(1).click();
		await expect(page.locator('.bubble').last()).toContainText('B —');
		await expect(choices.nth(1)).toHaveClass(/picked/);
	});

	test('the icon on a starter animates when the card is hovered', async ({ page }) => {
		// Unlocking left the pointer wherever the Start button was, and the cards
		// render under it — so park the mouse somewhere harmless before asking
		// what the resting state looks like.
		await page.mouse.move(4, 4);
		const card = page.getByRole('button', { name: /Sit an exam/ });
		const icon = card.locator('svg');
		await expect(icon).not.toHaveClass(/animate/);

		// The animation belongs to the card, not the icon: an icon that only
		// moves when the pointer lands on the icon itself is a fingernail-sized
		// target that nobody finds.
		await card.hover();
		await expect(icon).toHaveClass(/animate/);
	});

	test('New clears the thread and the citations', async ({ page }) => {
		await page.getByLabel('Message Verity').fill('What substantiates travel?');
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.locator('article.card')).toBeVisible();

		await page.getByRole('button', { name: 'New' }).click();

		await expect(page.getByRole('heading', { name: 'What are you checking?' })).toBeVisible();
		await expect(page.locator('.rail a')).toHaveCount(0);
	});
});

test.describe('documents', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await unlock(page);
	});

	test('a long paste becomes an attachment rather than a message', async ({ page }) => {
		const memo = `Engagement memo\n${'Client dinners are fully deductible. '.repeat(60)}`;
		await page.getByLabel('Message Verity').focus();
		// Pasting is the path this behaviour hangs off; typing must not trigger it.
		await page.evaluate((text) => {
			const field = document.querySelector<HTMLTextAreaElement>(
				'textarea[aria-label="Message Verity"]'
			)!;
			const data = new DataTransfer();
			data.setData('text/plain', text);
			field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
		}, memo);

		const chip = page.locator('.chips li');
		await expect(chip).toHaveCount(1);
		await expect(chip).toContainText('Engagement memo');
		// It became an attachment, so it did not also become the message.
		await expect(page.getByLabel('Message Verity')).toHaveValue('');

		await page.getByRole('button', { name: /^Remove / }).click();
		await expect(page.locator('.chips li')).toHaveCount(0);
	});

	test('a short paste stays in the message', async ({ page }) => {
		await page.getByLabel('Message Verity').focus();
		await page.evaluate(() => {
			const field = document.querySelector<HTMLTextAreaElement>(
				'textarea[aria-label="Message Verity"]'
			)!;
			const data = new DataTransfer();
			data.setData('text/plain', 'what about meals?');
			field.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
		});
		await expect(page.locator('.chips li')).toHaveCount(0);
	});
});

test.describe('settings', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await unlock(page);
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.locator('dialog[open]')).toBeVisible();
	});

	test('offers the models this key can reach', async ({ page }) => {
		await expect(page.locator('dialog select option')).toHaveCount(2);
		await expect(page.getByText('Realtime voice is available on this key.')).toBeVisible();
	});

	test('closes on Escape', async ({ page }) => {
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog[open]')).toHaveCount(0);
	});

	test('closes on the close button', async ({ page }) => {
		await page.getByRole('button', { name: 'Close settings' }).click();
		await expect(page.locator('dialog[open]')).toHaveCount(0);
	});

	test('switching character changes the accent', async ({ page }) => {
		await page.getByRole('button', { name: /Rosie/ }).click();
		await expect(page.locator('html')).toHaveAttribute('data-character', 'rose');

		const accent = await page.evaluate(() =>
			getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
		);
		expect(accent).toBe('#c84f82');
	});

	test('a skill can be switched off and a new one taught', async ({ page }) => {
		const first = page.locator('dialog .skills li').first();
		await expect(first.locator('input[type=checkbox]')).toBeChecked();
		await first.locator('input[type=checkbox]').uncheck();
		await expect(first).toHaveClass(/off/);

		await page.getByRole('button', { name: /Teach her something/ }).click();
		await page.getByLabel('Skill name').fill('Flag crypto');
		await page.getByLabel('Skill instructions').fill('Always mention basis tracking.');
		await page.getByRole('button', { name: 'Add skill' }).click();

		await expect(page.getByText('Flag crypto')).toBeVisible();
	});

	test('knowledge survives a reload', async ({ page }) => {
		const field = page.getByPlaceholder(/Mostly S-corps/);
		await field.fill('Vermont cheese importers, mostly.');
		await page.keyboard.press('Escape');

		await page.reload();
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByPlaceholder(/Mostly S-corps/)).toHaveValue(
			'Vermont cheese importers, mostly.'
		);
	});

	test('forget key returns to the gate', async ({ page }) => {
		await page.getByRole('button', { name: 'Forget' }).first().click();
		await expect(page.getByLabel('OpenAI API key')).toBeVisible();
	});
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test('the page never scrolls sideways and the composer stays put', async ({ page }) => {
		await page.goto('/');
		await unlock(page);

		await page.getByLabel('Message Verity').fill('What substantiates travel?');
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.locator('article.card')).toBeVisible();

		const layout = await page.evaluate(() => {
			const root = document.documentElement;
			const composer = document.querySelector('.composer')!.getBoundingClientRect();
			const scroller = document.querySelector('.scroller');
			return {
				horizontal: root.scrollWidth > root.clientWidth,
				composerVisible: composer.bottom <= window.innerHeight + 1,
				transcriptScrolls: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
				robotVisible: document.querySelector('.stage-frame')!.getBoundingClientRect().height > 60
			};
		});

		expect(layout.horizontal).toBe(false);
		expect(layout.composerVisible).toBe(true);
		expect(layout.robotVisible).toBe(true);
	});
});
