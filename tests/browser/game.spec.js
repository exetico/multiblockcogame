import { test, expect } from '@playwright/test';

async function begin(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'LET’S PLAY' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
}

test('boots without errors, starts, both players drop and park, then pauses', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await begin(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#score')).not.toHaveText('000000');
  const leftScore = await page.locator('#score').textContent();
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).not.toHaveText(leftScore);
  await page.keyboard.press('KeyC');
  await expect(page.locator('#hold')).not.toHaveAttribute('aria-label', 'Shared parked piece, empty');
  await page.keyboard.press('Period');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#exchange-status')).toContainText('Player 1 asks');
  await page.keyboard.press('Comma');
  await expect(page.locator('#exchange-status')).toContainText('Both press');
  await page.keyboard.press('Escape');
  await expect(page.locator('#overlay-title')).toContainText('pause');
  const before = await page.locator('#score').textContent();
  await page.keyboard.press('Space');
  await expect(page.locator('#score')).toHaveText(before);
  await page.getByRole('button', { name: 'BACK TOGETHER' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(errors).toEqual([]);
});

test('help pauses play and has precise shared rules and keyboard/controller mappings', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  const help = page.getByRole('dialog');
  await expect(help).toBeVisible();
  await expect(help).toContainText('12 × 12');
  await expect(help).toContainText('seven-column');
  await expect(help).toContainText('first controller plays right');
  await page.getByRole('button', { name: 'GOT IT' }).click();
  await expect(help).not.toBeVisible();
  await expect(page.locator('#overlay-title')).toContainText('pause');
});

test('sound, relay preference, best score and XP settings persist across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await page.locator('#relay-toggle').uncheck();
  await page.getByRole('button', { name: 'LET’S PLAY' }).click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(1100);
  const best = await page.locator('#best').textContent();
  expect(Number(best.replaceAll(',', ''))).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  await expect(page.locator('#relay-toggle')).not.toBeChecked();
  await expect(page.locator('#best')).toHaveText(best);
});

test('simultaneous movement works for both keyboard players', async ({ page }) => {
  await begin(page);
  const before = await page.locator('#board').evaluate(canvas => canvas.toDataURL());
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(230);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('ArrowRight');
  const after = await page.locator('#board').evaluate(canvas => canvas.toDataURL());
  expect(after).not.toBe(before);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`responsive square field and usable start button at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'LET’S PLAY' })).toBeInViewport();
    const rect = await page.locator('#board').boundingBox();
    expect(Math.abs(rect.width - rect.height)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.getByRole('button', { name: 'LET’S PLAY' }).click();
    await page.keyboard.press('Space');
    await expect(page.locator('#score')).not.toHaveText('000000');
  });
}

test('standard gamepad plays the right side, supports pause, and disconnect pauses safely', async ({ page }) => {
  await page.addInitScript(() => {
    window.testPad = null;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] });
  });
  await begin(page);
  await page.evaluate(() => {
    window.testPad = {
      index: 0, id: 'Test standard controller', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
  });
  await expect(page.locator('#device-1')).toContainText('CONTROLLER');
  await page.evaluate(() => { window.testPad.buttons[2].pressed = true; });
  await expect(page.locator('#score')).not.toHaveText('000000');
  await page.evaluate(() => { window.testPad.buttons[2].pressed = false; window.testPad.buttons[9].pressed = true; });
  await expect(page.locator('#overlay-title')).toContainText('pause');
  await page.evaluate(() => { window.testPad.buttons[9].pressed = false; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.testPad.buttons[9].pressed = true; });
  await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(() => { window.testPad = null; });
  await expect(page.locator('#overlay-title')).toContainText('pause');
  await expect(page.locator('#toast')).toContainText('disconnected');
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 900, height: 600 }]) {
  test(`focus maximizes the square field without scrolling at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const original = await page.locator('#board').boundingBox();
    await page.getByRole('button', { name: 'Toggle focus mode' }).click();
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    const board = await page.locator('#board').boundingBox();
    expect(board.width).toBeGreaterThan(original.width * 1.2);
    expect(board.height).toBeGreaterThanOrEqual(Math.min(viewport.height - 142, viewport.width - 446));
    expect(Math.abs(board.width - board.height)).toBeLessThan(2);
    const score = await page.locator('.scoreboard').boundingBox();
    const dock = await page.locator('.shared-dock').boundingBox();
    expect(score.x + score.width).toBeLessThan(board.x);
    expect(dock.x).toBeGreaterThan(board.x + board.width);
    for (const id of [0, 1]) {
      expect((await page.locator(`.player-${id === 0 ? 'one' : 'two'} .controls`).boundingBox()).height).toBeLessThan(100);
    }
    const pageSize = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
    }));
    expect(pageSize.width).toBeLessThanOrEqual(viewport.width);
    expect(pageSize.height).toBeLessThanOrEqual(viewport.height);
    await expect(page.locator('#pause')).toBeInViewport();
    await expect(page.locator('#restart')).toBeInViewport();
    await page.getByRole('button', { name: 'LET’S PLAY' }).click();
    await page.keyboard.press('Space');
    await expect(page.locator('#score')).not.toHaveText('000000');
    await page.keyboard.press('Period');
    await expect(page.locator('#hold')).not.toHaveAttribute('aria-label', 'Shared parked piece, empty');
  });
}

test('focus preserves a running round, adapts across breakpoints, and persists', async ({ page }) => {
  await begin(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#score')).not.toHaveText('000000');
  const score = await page.locator('#score').textContent();
  await page.getByRole('button', { name: 'Toggle focus mode' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#score')).toHaveText(score);
  await page.keyboard.press('Escape');
  const preview = await page.locator('#next-0').getAttribute('aria-label');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('main > .scoreboard')).toBeVisible();
  await expect(page.locator('main > .shared-dock')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.player-one > .scoreboard')).toBeVisible();
  await expect(page.locator('.player-two > .shared-dock')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle focus mode' }).click();
  await expect(page.locator('main > .scoreboard')).toBeVisible();
  await expect(page.locator('#score')).toHaveText(score);
  await expect(page.locator('#next-0')).toHaveAttribute('aria-label', preview);
  await page.getByRole('button', { name: 'Toggle focus mode' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Toggle focus mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.player-one > .scoreboard')).toBeVisible();
});

test('display settings pause safely, change grid rendering and hints, and persist without changing rules', async ({ page }) => {
  await begin(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#score')).not.toHaveText('000000');
  await page.getByRole('button', { name: 'Display settings' }).click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await expect(page.locator('#overlay-title')).toContainText('pause');
  const before = await page.locator('#board').evaluate(canvas => canvas.toDataURL());
  const score = await page.locator('#score').textContent();
  await page.locator('#setting-grid').uncheck();
  await expect.poll(() => page.locator('#board').evaluate(canvas => canvas.toDataURL())).not.toBe(before);
  await page.locator('#setting-hints').uncheck();
  await page.locator('#setting-focus').check();
  await expect(page.getByRole('button', { name: 'Toggle focus mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.player-one .controls')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#score')).toHaveText(score);
  await page.getByRole('button', { name: 'DONE', exact: false }).click();
  await expect(page.locator('#settings-dialog')).toBeHidden();
  await expect(page.locator('#overlay-title')).toContainText('pause');
  await expect(page.locator('#board')).toHaveAttribute('aria-label', 'Shared falling-block board, 12 columns and 12 rows');
  await page.getByRole('button', { name: 'BACK TOGETHER' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).not.toHaveText(score);
  await page.reload();
  await page.getByRole('button', { name: 'Display settings' }).click();
  await expect(page.locator('#setting-grid')).not.toBeChecked();
  await expect(page.locator('#setting-hints')).not.toBeChecked();
  await expect(page.locator('#setting-focus')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).toBeHidden();
});
