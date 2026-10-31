import { Game } from './engine.js';
import { Renderer } from './render.js';
import { Input, ACTIONS, PAD_ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS, cloneBindings, normalizeBindings, assignBinding, clearBinding, keyLabel, buttonLabel, isReservedKey } from './input.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}

const defaults = { best: 0, lifetimeXP: 0, sound: true, relays: true, focus: true, grid: true, hints: true, layoutChosen: false, controls: null };
let saved = { ...defaults };
let storageAvailable = true;
try {
  const raw = localStorage.getItem('common-ground-v1');
  if (raw) {
    const parsed = JSON.parse(raw);
    saved = {
      best: Number.isSafeInteger(parsed.best) && parsed.best >= 0 ? parsed.best : 0,
      lifetimeXP: Number.isSafeInteger(parsed.lifetimeXP) && parsed.lifetimeXP >= 0 ? parsed.lifetimeXP : 0,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : true,
      relays: typeof parsed.relays === 'boolean' ? parsed.relays : true,
      focus: typeof parsed.focus === 'boolean' ? parsed.focus : true,
      grid: typeof parsed.grid === 'boolean' ? parsed.grid : true,
      hints: typeof parsed.hints === 'boolean' ? parsed.hints : true,
      layoutChosen: parsed.layoutChosen === true,
      controls: parsed.controls ? normalizeBindings(parsed.controls) : null,
    };
  }
} catch (error) {
  console.warn('Could not load Common Ground progress.', error);
  toast('Browser storage is unavailable or invalid. Progress starts fresh for this session.');
}

try {
  const cookie = document.cookie.split('; ').find(value => value.startsWith('common-ground-layout='))?.split('=')[1];
  if (cookie === 'focus' || cookie === 'classic') {
    saved.focus = cookie === 'focus';
    saved.layoutChosen = true;
  }
} catch (error) {
  console.warn('Could not read layout preference cookie.', error);
  toast('Preference cookies are unavailable. We will try local storage instead.');
}

function save() {
  if (!storageAvailable) return;
  try { localStorage.setItem('common-ground-v1', JSON.stringify(saved)); }
  catch (error) {
    storageAvailable = false;
    console.warn('Could not save Common Ground progress.', error);
    toast('Browser storage is unavailable. Progress will only last for this session.');
  }
}

function rememberLayout() {
  saved.layoutChosen = true;
  save();
  try {
    const value = saved.focus ? 'focus' : 'classic';
    const path = new URL('.', window.location.href).pathname;
    document.cookie = `common-ground-layout=${value}; Max-Age=31536000; Path=${path}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    if (!document.cookie.split('; ').includes(`common-ground-layout=${value}`)) {
      throw new Error('The browser did not retain the preference cookie.');
    }
  } catch (error) {
    console.warn('Could not save layout preference cookie.', error);
    toast('Preference cookies are unavailable. Your choice uses local storage where available.');
  }
}

const audio = new Sound(message => {
  toast(message);
  updateSoundButton();
});
audio.enabled = saved.sound;
const renderer = new Renderer($('board'), [$('next-0'), $('next-1')], $('hold'));
let game = new Game({ relays: saved.relays });
let state = 'ready';
let lastTime = performance.now();
let creditedXP = 0;
let announcementTimer;
let hudSnapshot = '';
let previewSnapshot = '';
let lastPersist = 0;
const shell = document.querySelector('.board-shell');
$('relay-toggle').checked = saved.relays;

function updateSoundButton() {
  $('sound').classList.toggle('muted', !audio.enabled);
  $('sound').setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
}
updateSoundButton();

function blurButton() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

const scoreboard = document.querySelector('.scoreboard');
const dock = document.querySelector('.shared-dock');
const scoreHome = document.createComment('Team progress home');
const dockHome = document.createComment('Shared space home');
scoreboard.before(scoreHome);
dock.before(dockHome);
const wideScreen = window.matchMedia('(min-width: 701px)');
const isDialogOpen = () => $('help-dialog').open || $('settings-dialog').open || $('layout-dialog').open || $('controller-dialog').open || $('controls-dialog').open;

function applyDisplay() {
  document.body.classList.toggle('focus-mode', saved.focus);
  document.body.classList.toggle('hide-hints', !saved.hints);
  $('focus').setAttribute('aria-pressed', String(saved.focus));
  $('setting-focus').checked = saved.focus;
  $('setting-grid').checked = saved.grid;
  $('setting-hints').checked = saved.hints;
  renderer.showGrid = saved.grid;
  if (saved.focus && wideScreen.matches) {
    document.querySelector('.player-one').append(scoreboard);
    document.querySelector('.player-two').append(dock);
  } else {
    scoreHome.after(scoreboard);
    dockHome.after(dock);
  }
}
wideScreen.addEventListener('change', applyDisplay);
applyDisplay();

function updateOverlay() {
  const active = state === 'playing';
  $('overlay').hidden = active;
  $('pause').disabled = state === 'ready' || state === 'over';
  $('pause').innerHTML = `${state === 'paused' ? 'RESUME' : 'PAUSE'} <kbd>ESC</kbd>`;
  $('start-settings').hidden = state === 'paused';
  $('overlay-help').hidden = state === 'paused';
  if (state === 'paused') {
    $('overlay-tag').textContent = 'TAKE A BREATH. YOUR PARTNER WILL WAIT.';
    $('overlay-title').innerHTML = 'A moment<br /><em>of pause.</em>';
    $('overlay-description').textContent = 'Your shared space is right where you left it.';
    $('play').innerHTML = 'BACK TOGETHER <span>↗</span>';
  } else if (state === 'over') {
    $('overlay-tag').textContent = 'ONE TEAM. ANOTHER CHANCE.';
    $('overlay-title').innerHTML = 'Good things<br /><em>take teamwork.</em>';
    $('overlay-description').textContent = `${game.score.toLocaleString()} points · ${game.lines} rows · ${game.xp.toLocaleString()} XP\n${saved.lifetimeXP.toLocaleString()} lifetime team XP`;
    $('play').innerHTML = 'PLAY AGAIN <span>↗</span>';
    $('overlay-help').textContent = 'REVISIT THE FIELD GUIDE';
  }
  $('game-status').textContent = { ready: 'READY WHEN YOU ARE', playing: 'IN THIS TOGETHER', paused: 'TAKING A BREATHER', over: 'THANKS FOR PLAYING TOGETHER' }[state];
}

function start() {
  if (isDialogOpen()) return;
  audio.unlock();
  blurButton();
  if (state === 'paused') {
    state = 'playing';
  } else {
    saved.relays = $('relay-toggle').checked;
    save();
    game = new Game({ relays: saved.relays });
    creditedXP = 0;
    state = 'playing';
    hudSnapshot = '';
    previewSnapshot = '';
    audio.play('start');
    $('announcement').classList.remove('show');
    clearTimeout(announcementTimer);
  }
  input.reset();
  lastTime = performance.now();
  updateOverlay();
  updateHUD();
}

function pause(keepFocus = false) {
  if (state !== 'playing' && state !== 'paused') return;
  state = state === 'playing' ? 'paused' : 'playing';
  persistProgress();
  audio.unlock();
  audio.play('pause');
  input.reset();
  if (!keepFocus) blurButton();
  lastTime = performance.now();
  updateOverlay();
}

const input = new Input({
  onPause: pause,
  onActivate: start,
  isPlaying: () => state === 'playing',
  isDialogOpen,
  onPads(slots, lost, unsupported) {
    [0, 1].forEach(id => {
      const connected = slots.some(slot => slot.player === id);
      $('device-' + id).textContent = connected ? 'CONTROLLER + KEYS' : 'KEYBOARD · CONNECT PAD';
      document.querySelector(id === 0 ? '.player-one' : '.player-two').classList.toggle('has-controller', connected);
    });
    updateControllers(slots, unsupported);
    if (lost && state === 'playing') {
      pause();
      toast('Controller disconnected. Paused so you can reconnect.');
    } else if (slots.length) {
      toast(`Controller sides: ${slots.map(slot => `pad ${slot.index + 1} = ${slot.player === 0 ? 'left' : 'right'}`).join(', ')}. Start / Options pauses.`);
    }
    if (unsupported) toast('This controller has no standard mapping. Use a standard gamepad or the keyboard.');
  },
});

let keyboardLayout = null;
let bindings = saved.controls ? cloneBindings(saved.controls) : cloneBindings();
input.setBindings(bindings);
const keyName = code => (code ? keyLabel(code, keyboardLayout) : '—');
const short = index => buttonLabel(index).split(' / ')[0];
const padName = list => (list.length === 0 ? '—' : list.length === 1 ? buttonLabel(list[0]) : list.map(short).join(' / '));
const isDefaultMove = () => ['left', 'down', 'right'].every(action => String(bindings.pad[action]) === String(DEFAULT_BINDINGS.pad[action]));

function hintRow(label, values) {
  const row = document.createElement('div');
  const name = document.createElement('span');
  name.textContent = label;
  const keys = document.createElement('span');
  for (const value of values) {
    const key = document.createElement('kbd');
    key.textContent = value;
    if (value.length > 2) key.className = 'wide-key';
    keys.append(key);
  }
  row.append(name, keys);
  if (values.length > 1 && values.join('').length > 4) row.className = 'full';
  return row;
}

function renderBindings() {
  for (const id of [0, 1]) {
    const map = bindings.keys[id];
    const first = action => keyName(map[action][0]);
    $(`keys-${id}`).replaceChildren(
      hintRow('Move', [first('left'), first('down'), first('right')]),
      hintRow([first('ccw'), first('cw')].join('').length > 4 ? 'Rotate ↺ / ↻' : 'Rotate', [first('ccw'), first('cw')]),
      hintRow('Drop', [first('drop')]),
      hintRow('Park', [first('park')]),
      hintRow('Trade', [first('exchange')]),
    );
  }
  const pad = bindings.pad;
  const move = isDefaultMove() ? 'D-PAD / STICK' : `STICK / ${['left', 'down', 'right'].map(action => (pad[action].length ? short(pad[action][0]) : '—')).join(' ')}`;
  const padRows = [['Move', move], ['Rotate ↻', padName(pad.cw)], ['Rotate ↺', padName(pad.ccw)], ['Drop', padName(pad.drop)], ['Park', padName(pad.park)], ['Exchange', padName(pad.exchange)]];
  document.querySelectorAll('.controller-controls').forEach(element => element.remove());
  for (const selector of ['.player-one', '.player-two']) {
    const hints = document.createElement('div');
    hints.className = 'controls controller-controls';
    hints.append(...padRows.map(([label, value]) => hintRow(label, [value])));
    document.querySelector(selector + ' .keyboard-controls').after(hints);
  }
  const legend = [['Stick', 'Move / soft drop'], ...PAD_ACTIONS.map(action => [padName(pad[action]), ACTION_LABELS[action]])];
  document.querySelectorAll('.pad-legend').forEach(element => element.replaceChildren(...legend.map(([button, label]) => {
    const item = document.createElement('span');
    const name = document.createElement('b');
    name.textContent = button;
    item.append(name, ' ' + label);
    return item;
  })));
  document.querySelectorAll('[data-bind]').forEach(element => {
    const [id, action] = element.dataset.bind.split(':');
    element.textContent = keyName(bindings.keys[id][action][0]);
  });
}
renderBindings();
navigator.keyboard?.getLayoutMap?.().then(map => { keyboardLayout = map; renderBindings(); renderRemap(); }).catch(() => {});
const tradeKey = id => keyName(bindings.keys[id].exchange[0]);

function updateControllers(slots, unsupported = false) {
  $('pad-count').textContent = `${slots.length}/2`;
  $('swap-controllers').disabled = slots.length === 0;
  $('pad-devices').replaceChildren();
  for (const id of [0, 1]) {
    const entry = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = `${id === 0 ? 'LEFT' : 'RIGHT'} PLAYER`;
    const device = document.createElement('span');
    device.textContent = slots.find(slot => slot.player === id)?.name ?? 'Keyboard · no controller assigned';
    entry.append(heading, device);
    $('pad-devices').append(entry);
  }
  $('pad-diagnostic').textContent = !window.isSecureContext ? 'Gamepad access requires HTTPS or localhost.' :
    !navigator.getGamepads ? 'This browser does not expose gamepad access. Use the keyboard or a supported browser.' :
    unsupported ? 'A controller was detected without a standard mapping. Try USB or another browser; keyboard play remains available.' :
    slots.length ? `${slots.length} standard controller${slots.length === 1 ? '' : 's'} ready. Live button hints appear on each connected side.` :
    'Waiting for a controller. Connect it and press a button.';
}
updateControllers([]);

function persistProgress() {
  const newXP = game.xp - creditedXP;
  if (newXP > 0 || game.score > saved.best) {
    saved.lifetimeXP += newXP;
    creditedXP = game.xp;
    saved.best = Math.max(saved.best, game.score);
    save();
  }
}

function updateHUD() {
  const signature = [game.score, game.lines, game.level, game.xp, saved.best, game.exchangeRequest, game.hold?.type, game.hold?.relayOwner,
    ...game.players.flatMap(p => [p.piece?.relayOwner, p.canHold])].join(':');
  if (signature !== hudSnapshot) {
    hudSnapshot = signature;
    $('score').textContent = String(game.score).padStart(6, '0');
    $('level').textContent = String(game.level).padStart(2, '0');
    $('lines').textContent = String(game.lines).padStart(2, '0');
    $('best').textContent = saved.best.toLocaleString();
    $('xp').textContent = `${game.xp.toLocaleString()} XP`;
    $('xp-fill').style.width = `${(game.lines % 10) * 10}%`;
    $('xp-caption').textContent = `${10 - game.lines % 10} rows to level ${game.level + 1} · ${saved.lifetimeXP.toLocaleString()} lifetime XP`;
    $('hold-status').textContent = game.hold?.relayOwner !== null && game.hold ? `Relay: player ${2 - game.hold.relayOwner} can finish handoff` : 'Either player can use it';
    $('exchange-status').textContent = game.exchangeRequest === null ? 'Both press exchange to trade' : `Player ${game.exchangeRequest + 1} asks — partner, confirm!`;
    game.players.forEach(p => {
      const relay = p.piece != null && p.piece.relayOwner !== null;
      const note = $('relay-' + p.id);
      note.textContent = relay ? '⇄ RELAY — pass before locking' : !p.canHold ? 'Park used. Lock to reset.' : ['Your side. Our score.', 'Different sides. Same team.'][p.id];
      note.classList.toggle('active', relay);
    });
  }
  const previews = game.players.map(p => p.queue.slice(0, 3).map(item => `${item.type}${item.relayOwner}`).join(',')).join('|') + `|${game.hold?.type}:${game.hold?.relayOwner}`;
  if (previews !== previewSnapshot) {
    previewSnapshot = previews;
    renderer.updatePreviews(game);
  }
}

function announce(title, detail) {
  $('announcement').replaceChildren();
  $('announcement').append(document.createTextNode(title));
  const small = document.createElement('small');
  small.textContent = detail;
  $('announcement').append(small);
  $('announcement').classList.add('show');
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => $('announcement').classList.remove('show'), 1600);
}

function processEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'notice') { toast(event.message); continue; }
    audio.play(event.type, event.count);
    if (event.type === 'request') toast(`Player ${event.id + 1} wants to exchange. Partner, press ${tradeKey(1 - event.id)} or ${padName(bindings.pad.exchange)}.`);
    if (event.type === 'exchange') announce('A GOOD EXCHANGE', 'TWO SIDES. ONE TEAM.');
    if (event.type === 'lock') {
      shell.classList.remove('shake');
      void shell.offsetWidth;
      shell.classList.add('shake');
      if (event.spin) announce('T-SPIN', 'NICE FIT.');
    }
    if (event.type === 'clear') {
      const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'FOUR ROW FLOW'];
      announce(`${event.spin ? 'T-SPIN ' : ''}${names[event.count]}`, `+${event.xp.toLocaleString()} XP${event.b2b ? ' · BACK-TO-BACK' : ''}${event.combo > 0 ? ` · COMBO ×${event.combo + 1}` : ''}`);
      renderer.flash(event.rows);
      shell.classList.remove('clear-flash');
      void shell.offsetWidth;
      shell.classList.add('clear-flash');
    }
    if (event.type === 'over') {
      state = 'over';
      input.reset();
      if (game.xp > creditedXP || performance.now() - lastPersist > 1000) {
        persistProgress();
        lastPersist = performance.now();
      }
      updateOverlay();
    }
  }
  persistProgress();
}

function frame(now) {
  const dt = Math.min(100, Math.max(0, now - lastTime));
  lastTime = now;
  input.update(dt, game);
  if (state === 'playing') {
    game.tick(dt);
    processEvents();
  }
  updateHUD();
  renderer.draw(game);
  requestAnimationFrame(frame);
}

$('play').addEventListener('click', start);
$('pause').addEventListener('click', () => pause());
$('focus').addEventListener('click', () => {
  saved.focus = !saved.focus;
  applyDisplay();
  rememberLayout();
  blurButton();
});
let settingsCloseTimer;
function openSettings(origin) {
  clearTimeout(settingsCloseTimer);
  if (isDialogOpen()) return;
  if (state === 'playing') pause(true);
  input.reset();
  const active = document.activeElement;
  $('settings-dialog').show();
  if (origin === 'hover') {
    blurButton();
    if (active instanceof HTMLElement && active !== document.body) active.focus({ preventScroll: true });
  }
  $('settings').setAttribute('aria-expanded', 'true');
}
function closeSettings() {
  clearTimeout(settingsCloseTimer);
  $('settings-dialog').close();
}
function scheduleSettingsClose() {
  clearTimeout(settingsCloseTimer);
  settingsCloseTimer = setTimeout(() => {
    if (!$('settings-dialog').contains(document.activeElement) && document.activeElement !== $('settings')) closeSettings();
  }, 250);
}
for (const id of ['settings', 'settings-dialog']) {
  $(id).addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') openSettings('hover'); });
  $(id).addEventListener('pointerleave', scheduleSettingsClose);
  $(id).addEventListener('focusin', openSettings);
  $(id).addEventListener('focusout', scheduleSettingsClose);
}
$('settings').addEventListener('click', openSettings);
document.addEventListener('pointerdown', event => {
  if ($('settings-dialog').open && !$('settings-dialog').contains(event.target) && !$('settings').contains(event.target)) closeSettings();
});
document.addEventListener('keydown', event => {
  if (event.code === 'Escape' && $('settings-dialog').open) {
    event.preventDefault();
    closeSettings();
  }
});
for (const [id, key] of [['setting-focus', 'focus'], ['setting-grid', 'grid'], ['setting-hints', 'hints']]) {
  $(id).addEventListener('change', () => {
    saved[key] = $(id).checked;
    applyDisplay();
    if (key === 'focus') rememberLayout();
    else save();
  });
}
for (const id of ['close-settings', 'settings-done']) {
  $(id).addEventListener('click', closeSettings);
}
$('settings-dialog').addEventListener('close', () => {
  clearTimeout(settingsCloseTimer);
  $('settings').setAttribute('aria-expanded', 'false');
  input.reset();
  blurButton();
});
function chooseLayout(focus) {
  saved.focus = focus;
  applyDisplay();
  rememberLayout();
  $('layout-dialog').close();
}
$('choose-focus').addEventListener('click', () => chooseLayout(true));
$('choose-classic').addEventListener('click', () => chooseLayout(false));
$('skip-layout').addEventListener('click', () => chooseLayout(true));
$('layout-dialog').addEventListener('cancel', event => { event.preventDefault(); chooseLayout(true); });
$('layout-dialog').addEventListener('close', () => { input.reset(); blurButton(); });
function openControllers() {
  closeSettings();
  if (state === 'playing') pause();
  input.reset();
  $('controller-dialog').showModal();
}
for (const id of ['controllers', 'device-0', 'device-1']) $(id).addEventListener('click', openControllers);
for (const id of ['close-controllers', 'controllers-done']) $(id).addEventListener('click', () => $('controller-dialog').close());
$('controller-dialog').addEventListener('close', () => { input.reset(); blurButton(); });
$('swap-controllers').addEventListener('click', () => input.swapPads());

let remapTab = 'keys-0';
let capture = null;
let captureEndedAt = 0;
let padFrame = 0;
const remapKind = () => (remapTab === 'pad' ? 'pad' : 'keys');
const remapPlayer = () => Number(remapTab.slice(-1));
const describe = name => {
  if (!name.includes(':')) return `Controller · ${ACTION_LABELS[name]}`;
  const [id, action] = name.split(':');
  return `${id === '0' ? 'Left' : 'Right'} · ${ACTION_LABELS[action]}`;
};

function renderRemap() {
  if (!$('controls-dialog').open) return;
  const kind = remapKind();
  const actions = kind === 'pad' ? PAD_ACTIONS : ACTIONS;
  const lists = kind === 'pad' ? bindings.pad : bindings.keys[remapPlayer()];
  document.querySelectorAll('.remap-tabs [role=tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === remapTab)));
  $('remap-table').replaceChildren(...actions.map(action => {
    const row = document.createElement('div');
    row.className = 'remap-row';
    if (!lists[action].length) row.classList.add('unbound');
    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[action] + (lists[action].length ? '' : ' · UNBOUND');
    row.append(label);
    for (const slot of [0, 1]) {
      const value = lists[action][slot];
      const cell = document.createElement('span');
      cell.className = 'remap-cell';
      const button = document.createElement('button');
      button.className = 'remap-slot';
      button.dataset.action = action;
      button.dataset.slot = String(slot);
      const waiting = capture && capture.action === action && capture.slot === slot;
      button.textContent = waiting ? (kind === 'pad' ? 'PRESS BUTTON…' : 'PRESS KEY…') : value === undefined ? (slot ? '+ ADD' : '—') : kind === 'pad' ? buttonLabel(value) : keyName(value);
      if (waiting) button.classList.add('waiting');
      if (value === undefined && slot) button.classList.add('empty');
      button.disabled = slot === 1 && lists[action].length === 0;
      button.setAttribute('aria-label', `${ACTION_LABELS[action]}, ${slot ? 'extra' : 'main'} binding: ${button.textContent}. Select to change.`);
      button.addEventListener('click', event => {
        if (event.detail === 0 && performance.now() - captureEndedAt < 300) return;
        startCapture(action, Math.min(slot, lists[action].length));
      });
      cell.append(button);
      if (value !== undefined) {
        const clear = document.createElement('button');
        clear.className = 'remap-clear';
        clear.textContent = '×';
        clear.setAttribute('aria-label', `Remove ${button.textContent} from ${ACTION_LABELS[action]}`);
        clear.addEventListener('click', () => {
          const target = kind === 'pad' ? [action, slot] : [remapPlayer(), action, slot];
          commitBindings(clearBinding(bindings, kind, target), `Removed from ${ACTION_LABELS[action]}.`);
        });
        cell.append(clear);
      }
      row.append(cell);
    }
    return row;
  }));
}

function commitBindings(next, message) {
  bindings = next;
  saved.controls = cloneBindings(bindings);
  input.setBindings(bindings);
  save();
  renderBindings();
  const unbound = bindings.keys.flatMap((map, id) => ACTIONS.filter(action => !map[action].length).map(action => `${id}:${action}`))
    .concat(PAD_ACTIONS.filter(action => !bindings.pad[action].length));
  $('remap-status').textContent = message + (unbound.length ? ` Unbound: ${unbound.map(describe).join(', ')}.` : '');
  renderRemap();
}

function startCapture(action, slot) {
  stopCapture();
  capture = { action, slot, kind: remapKind() };
  $('remap-status').textContent = capture.kind === 'pad' ? `Press a controller button for ${ACTION_LABELS[action]}. Escape cancels.` : `Press a key for ${ACTION_LABELS[action]}. Escape cancels.`;
  renderRemap();
  document.querySelector(`.remap-slot[data-action="${action}"][data-slot="${slot}"]`)?.focus();
  if (capture.kind === 'pad') {
    const held = () => new Set((navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(pad => pad?.connected)
      .flatMap(pad => pad.buttons.map((button, index) => (button.pressed ? index : -1)).filter(index => index >= 0 && index <= 16)));
    let baseline = held();
    const poll = () => {
      if (!capture || capture.kind !== 'pad') return;
      const now = held();
      const fresh = [...now].find(index => !baseline.has(index));
      baseline = new Set([...baseline].filter(index => now.has(index)));
      if (fresh !== undefined) finishCapture(fresh);
      else padFrame = requestAnimationFrame(poll);
    };
    padFrame = requestAnimationFrame(poll);
  }
}

function stopCapture() {
  cancelAnimationFrame(padFrame);
  if (capture) captureEndedAt = performance.now();
  capture = null;
}

function finishCapture(value) {
  const { action, slot, kind } = capture;
  stopCapture();
  const target = kind === 'pad' ? [action, slot] : [remapPlayer(), action, slot];
  const label = kind === 'pad' ? buttonLabel(value) : keyName(value);
  const { bindings: next, moved } = assignBinding(bindings, kind, target, value);
  commitBindings(next, `${label} → ${ACTION_LABELS[action]}.${moved ? ` Swapped with ${describe(moved)}.` : ''}`);
  document.querySelector(`.remap-slot[data-action="${action}"][data-slot="${Math.min(slot, (kind === 'pad' ? bindings.pad : bindings.keys[remapPlayer()])[action].length - 1)}"]`)?.focus();
}

document.addEventListener('keydown', event => {
  if (!capture) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat) return;
  if (event.code === 'Escape') {
    stopCapture();
    $('remap-status').textContent = 'Cancelled. Nothing changed.';
    renderRemap();
    return;
  }
  if (capture.kind === 'pad') return;
  if (isReservedKey(event.code) || !event.code) {
    $('remap-status').textContent = `${event.code || 'That key'} is reserved. Escape always pauses. Try another key.`;
    return;
  }
  finishCapture(event.code);
}, true);
document.addEventListener('keyup', event => {
  if ($('controls-dialog').open && performance.now() - captureEndedAt < 300) event.preventDefault();
}, true);
$('controls-dialog').addEventListener('cancel', event => {
  if (capture || performance.now() - captureEndedAt < 300) event.preventDefault();
});

function openRemap(tab) {
  closeSettings();
  if ($('controller-dialog').open) $('controller-dialog').close();
  if (state === 'playing') pause();
  input.reset();
  if (typeof tab === 'string') remapTab = tab;
  $('remap-status').textContent = '';
  $('controls-dialog').showModal();
  renderRemap();
}
$('remap').addEventListener('click', () => openRemap());
$('settings-remap').addEventListener('click', () => openRemap());
$('controllers-remap').addEventListener('click', () => openRemap('pad'));
document.querySelectorAll('.remap-tabs [role=tab]').forEach(tab => tab.addEventListener('click', () => {
  stopCapture();
  remapTab = tab.dataset.tab;
  $('remap-status').textContent = '';
  renderRemap();
}));
$('reset-tab').addEventListener('click', () => {
  stopCapture();
  const next = cloneBindings(bindings);
  const defaults = cloneBindings();
  if (remapKind() === 'pad') next.pad = defaults.pad;
  else next.keys[remapPlayer()] = defaults.keys[remapPlayer()];
  const codes = next.keys.flatMap(map => Object.values(map).flat());
  // Restoring one keyboard set can collide with custom keys on the other; restore both if so.
  if (new Set(codes).size !== codes.length) next.keys = defaults.keys;
  commitBindings(next, new Set(codes).size !== codes.length ? 'Defaults restored for both keyboards to avoid duplicate keys.' : 'Defaults restored for this set.');
});
$('reset-all').addEventListener('click', () => { stopCapture(); commitBindings(cloneBindings(), 'All keys and buttons restored to defaults.'); });
for (const id of ['close-controls', 'controls-done']) $(id).addEventListener('click', () => $('controls-dialog').close());
$('controls-dialog').addEventListener('close', () => { stopCapture(); input.reset(); blurButton(); });
$('restart').addEventListener('click', () => {
  if (state === 'playing') pause();
  if ((state === 'paused' && (game.score || game.players.some(p => p.queue.length && p.canHold === false))) || game.lines) {
    if (!window.confirm('Start a new round? Your best score and earned XP are already saved.')) { blurButton(); return; }
  }
  state = 'ready';
  start();
});
$('sound').addEventListener('click', () => {
  audio.enabled = !audio.enabled;
  saved.sound = audio.enabled;
  if (audio.enabled) { audio.unlock(); audio.play('rotate'); }
  save();
  updateSoundButton();
  blurButton();
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('Fullscreen is unavailable here. Use your browser’s fullscreen or landscape mode.');
  } catch (error) {
    toast(`Fullscreen unavailable: ${error.message}`);
  }
  blurButton();
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});

function openHelp() {
  closeSettings();
  if (state === 'playing') pause();
  input.reset();
  $('help-dialog').showModal();
}
function closeHelp() {
  $('help-dialog').close();
  blurButton();
}
$('help').addEventListener('click', openHelp);
$('overlay-help').addEventListener('click', openHelp);
$('close-help').addEventListener('click', closeHelp);
$('help-done').addEventListener('click', closeHelp);
$('help-dialog').addEventListener('close', () => { input.reset(); blurButton(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pause();
});
window.addEventListener('blur', () => { if (state === 'playing') pause(); });
window.addEventListener('pagehide', persistProgress);
updateOverlay();
updateHUD();
if (!saved.layoutChosen) $('layout-dialog').showModal();
requestAnimationFrame(frame);
