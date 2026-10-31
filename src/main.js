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

const defaults = { best: 0, lifetimeXP: 0, sound: true, relays: true };
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
    };
  }
} catch (error) {
  console.warn('Could not load Common Ground progress.', error);
  toast('Browser storage is unavailable or invalid. Progress starts fresh for this session.');
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
  if ($('help-dialog').open) return;
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

function pause() {
  if (state !== 'playing' && state !== 'paused') return;
  state = state === 'playing' ? 'paused' : 'playing';
  persistProgress();
  audio.unlock();
  audio.play('pause');
  input.reset();
  blurButton();
  lastTime = performance.now();
  updateOverlay();
}

const input = new Input({
  onPause: pause,
  onActivate: start,
  isPlaying: () => state === 'playing',
  isDialogOpen: () => $('help-dialog').open,
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
$('pause').addEventListener('click', pause);
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
requestAnimationFrame(frame);
