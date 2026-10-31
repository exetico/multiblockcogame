import { test, expect } from '@playwright/test';

async function visit(page) {
  await page.goto('/');
  if (await page.locator('#layout-dialog').isVisible()) {
    await page.getByRole('button', { name: 'Classic', exact: false }).click();
  }
}

async function begin(page) {
  await visit(page);
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
  await visit(page);
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
    await visit(page);
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
    await visit(page);
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
      expect((await page.locator(`.player-${id === 0 ? 'one' : 'two'} .controls:visible`).boundingBox()).height).toBeLessThan(125);
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

  test('first visit defaults to Focus; choice and cookie survive reload and Classic remains available', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('#layout-dialog')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    await expect(page.locator('#focus')).toHaveClass(/icon-button/);
    await expect(page.locator('#focus svg')).toBeVisible();
    await page.getByRole('button', { name: 'Focus RECOMMENDED' }).click();
    await expect(page.locator('#layout-dialog')).toBeHidden();
    expect((await context.cookies()).find(cookie => cookie.name === 'common-ground-layout')?.value).toBe('focus');
    await page.reload();
    await expect(page.locator('#layout-dialog')).toBeHidden();
    await expect(page.locator('#focus')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Toggle focus mode' }).click();
    expect((await context.cookies()).find(cookie => cookie.name === 'common-ground-layout')?.value).toBe('classic');
    await page.reload();
    await expect(page.locator('#focus')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#layout-dialog')).toBeHidden();
  });

  test('first-time Classic choice persists; skipping uses Focus', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Classic', exact: false }).click();
    await page.reload();
    await expect(page.locator('#layout-dialog')).toBeHidden();
    await expect(page.locator('#focus')).toHaveAttribute('aria-pressed', 'false');
    await context.clearCookies();
    await page.evaluate(() => localStorage.removeItem('common-ground-v1'));
    await page.reload();
    await page.keyboard.press('Escape');
    await expect(page.locator('#layout-dialog')).toBeHidden();
    await page.reload();
    await expect(page.locator('#focus')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#layout-dialog')).toBeHidden();
  });

  test('settings open on hover, stay reachable, close on leaving and pause safely', async ({ page }) => {
    await begin(page);
    await page.getByRole('button', { name: 'Display settings' }).hover();
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await expect(page.locator('#settings')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#overlay-title')).toContainText('pause');
    await page.locator('#settings-title').hover();
    await page.waitForTimeout(350);
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.locator('#overlay-title').hover();
    await expect(page.locator('#settings-dialog')).toBeHidden();
    await expect(page.locator('#overlay-title')).toContainText('pause');
    await page.locator('#settings').focus();
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-dialog')).toBeHidden();
  });

  test('touch users can select a layout and tap settings', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await page.getByRole('button', { name: 'Focus RECOMMENDED' }).tap();
    await page.locator('#settings').tap();
    await expect(page.locator('#settings-dialog')).toBeVisible();
    await page.locator('#setting-grid').uncheck();
    await page.locator('#settings-done').tap();
    await expect(page.locator('#settings-dialog')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await context.close();
  });
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
  await expect(page.locator('.player-one .controls:visible')).toHaveCount(0);
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

test('Danish-friendly right controls are shown and deliver rotate, park and exchange actions', async ({ page }) => {
  await begin(page);
  await expect(page.locator('.player-two .controls:visible')).toContainText('R SHIFT');
  await expect(page.locator('.player-two .controls:visible')).toContainText('R CTRL');
  await expect(page.locator('.player-two .controls:visible')).toContainText('BACKSPACE');
  const before = await page.locator('#board').evaluate(canvas => canvas.toDataURL());
  await page.keyboard.press('ShiftRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ControlRight');
  await expect(page.locator('#hold')).not.toHaveAttribute('aria-label', 'Shared parked piece, empty');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#exchange-status')).toContainText('Player 2 asks');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#exchange-status')).toContainText('Both press');
  expect(await page.locator('#board').evaluate(canvas => canvas.toDataURL())).not.toBe(before);
});

test('visible controller guide explains Bluetooth, detects devices, switches sides and shows pad hints', async ({ page }) => {
  await page.addInitScript(() => {
    window.testPads = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => window.testPads });
  });
  await begin(page);
  await page.locator('#controllers').click();
  await expect(page.locator('#controller-dialog')).toBeVisible();
  await expect(page.locator('#controller-dialog')).toContainText("computer's Bluetooth settings");
  await expect(page.locator('#overlay-title')).toContainText('pause');
  await expect(page.locator('#swap-controllers')).toBeDisabled();
  await page.evaluate(() => {
    window.testPads = [0, 1].map(index => ({
      index, id: `Standard pad ${index + 1}`, mapping: 'standard', connected: true,
      axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    }));
  });
  await expect(page.locator('#pad-count')).toHaveText('2/2');
  await expect(page.locator('#pad-devices')).toContainText('Standard pad 1');
  await expect(page.locator('.player-two .controls:visible')).toContainText('A / CROSS');
  await page.locator('#swap-controllers').click();
  await expect(page.locator('#pad-devices > div').first()).toContainText('Standard pad 1');
  await page.evaluate(() => { window.testPads = [window.testPads[1]]; });
  await expect(page.locator('#pad-count')).toHaveText('1/2');
  await expect(page.locator('#pad-devices > div').last()).toContainText('Standard pad 2');
  await expect(page.locator('.player-one .controls:visible')).toContainText('SPACE');
  await page.locator('#controllers-done').click();
  await expect(page.locator('#controller-dialog')).toBeHidden();
  await expect(page.locator('#overlay-title')).toContainText('pause');
});

test('keys can be remapped with swap, cancel, reserved-key protection, persistence and reset', async ({ page }) => {
  await begin(page);
  await page.locator('#remap').click();
  const dialog = page.locator('#controls-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#overlay-title')).toContainText('pause');
  await page.locator('#tab-keys-1').click();
  await dialog.locator('.remap-slot[data-action="park"][data-slot="0"]').click();
  await expect(dialog.locator('.remap-slot.waiting')).toHaveText('PRESS KEY…');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#remap-status')).toContainText('Cancelled');
  await dialog.locator('.remap-slot[data-action="park"][data-slot="0"]').click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#remap-status')).toContainText('reserved');
  await page.keyboard.press('KeyL');
  await expect(dialog.locator('.remap-slot[data-action="park"][data-slot="0"]')).toHaveText('L');
  await dialog.locator('.remap-slot[data-action="drop"][data-slot="0"]').click();
  await page.keyboard.press('KeyV');
  await expect(page.locator('#remap-status')).toContainText('Swapped with Left · Exchange');
  await page.locator('#controls-done').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.player-two .keyboard-controls')).toContainText('L');
  await expect(page.locator('.player-one .keyboard-controls')).toContainText('ENTER');
  await page.reload();
  await expect(page.locator('.player-two .keyboard-controls')).toContainText('L');
  await page.getByRole('button', { name: 'LET’S PLAY' }).click();
  await page.keyboard.press('KeyL');
  await expect(page.locator('#hold')).not.toHaveAttribute('aria-label', 'Shared parked piece, empty');
  await page.keyboard.press('Enter');
  await expect(page.locator('#exchange-status')).toContainText('Player 1 asks');
  await page.locator('#remap').click();
  await page.locator('#reset-all').click();
  await expect(page.locator('#remap-status')).toContainText('restored');
  await page.locator('#controls-done').click();
  await expect(page.locator('.player-two .keyboard-controls')).toContainText('R CTRL');
  await expect(page.locator('.player-one .keyboard-controls')).toContainText('SPACE');
});

test('controller buttons can be remapped by pressing them, from the controller guide', async ({ page }) => {
  await page.addInitScript(() => {
    window.testPad = null;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] });
  });
  await begin(page);
  await page.evaluate(() => {
    window.testPad = { index: 0, id: 'Remap pad', mapping: 'standard', connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
  });
  await page.locator('#controllers').click();
  await page.locator('#controllers-remap').click();
  const dialog = page.locator('#controls-dialog');
  await expect(page.locator('#tab-pad')).toHaveAttribute('aria-selected', 'true');
  await dialog.locator('.remap-slot[data-action="drop"][data-slot="0"]').click();
  await expect(dialog.locator('.remap-slot.waiting')).toHaveText('PRESS BUTTON…');
  await page.evaluate(() => { window.testPad.buttons[7].pressed = true; });
  await expect(dialog.locator('.remap-slot[data-action="drop"][data-slot="0"]')).toHaveText('RT / R2');
  await page.evaluate(() => { window.testPad.buttons[7].pressed = false; });
  await page.locator('#controls-done').click();
  await expect(page.locator('.player-two .controller-controls')).toContainText('RT / R2');
  await page.locator('#pause').click();
  await page.evaluate(() => { window.testPad.buttons[2].pressed = true; });
  await page.waitForTimeout(150);
  await expect(page.locator('#score')).toHaveText('000000');
  await page.evaluate(() => { window.testPad.buttons[2].pressed = false; window.testPad.buttons[7].pressed = true; });
  await expect(page.locator('#score')).not.toHaveText('000000');
});
