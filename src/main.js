import { Game } from './engine.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
}

const defaults = { best: 0, lifetimeXP: 0, sound: true, relays: true, focus: true, grid: true, hints: true, layoutChosen: false };
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
const isDialogOpen = () => $('help-dialog').open || $('settings-dialog').open || $('layout-dialog').open;

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
      $('device-' + id).textContent = slots.some(slot => slot.player === id) ? 'CONTROLLER + KEYS' : 'KEYBOARD';
    });
    if (lost && state === 'playing') {
      pause();
      toast('Controller disconnected. Paused so you can reconnect.');
    } else if (slots.length) {
      toast(`${slots.length === 1 ? 'Controller connected: right player.' : 'Controllers connected: first = right, second = left.'} Start / Options pauses.`);
    }
    if (unsupported) toast('This controller has no standard mapping. Use a standard gamepad or the keyboard.');
  },
});

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
    if (event.type === 'request') toast(`Player ${event.id + 1} wants to exchange. Partner, press ${event.id === 0 ? ',' : 'V'} or a bumper.`);
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
  if ($('settings-dialog').open || $('help-dialog').open || $('layout-dialog').open) return;
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
