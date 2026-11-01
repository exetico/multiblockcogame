import { cells, COLORS, WIDTH, HEIGHT, FIELD, STRIDE } from './engine.js';

const OWNER = ['#79e3cb', '#f3a38c'];

function rounded(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function block(ctx, x, y, size, type, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const gap = Math.max(1.3, size * 0.07);
  rounded(ctx, x + gap, y + gap, size - gap * 2, size - gap * 2, size * 0.1);
  ctx.fillStyle = COLORS[type];
  ctx.fill();
  ctx.fillStyle = '#ffffff38';
  ctx.fillRect(x + gap + 2, y + gap + 1, size - gap * 2 - 4, Math.max(1, size * 0.08));
  ctx.fillStyle = '#00000018';
  ctx.fillRect(x + gap + 2, y + size - gap - Math.max(2, size * 0.15), size - gap * 2 - 4, Math.max(1, size * 0.1));
  ctx.restore();
}

export class Renderer {
  constructor(board, previews, hold) {
    this.canvas = board;
    this.ctx = board.getContext('2d');
    this.previews = previews;
    this.hold = hold;
    this.width = 0;
    this.height = 0;
    this.flashUntil = 0;
    this.flashRows = [];
    this.lastGame = null;
    this.showGrid = true;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(board);
    for (const canvas of [...previews, hold]) this.resize.observe(canvas);
    this.measure();
  }

  measure() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    if (this.lastGame) {
      this.draw(this.lastGame);
      this.updatePreviews(this.lastGame);
    }
  }

  flash(rows) {
    this.flashRows = rows;
    this.flashUntil = performance.now() + 260;
  }

  draw(game) {
    this.lastGame = game;
    const ctx = this.ctx;
    const w = this.width, h = this.height, sx = w / WIDTH, sy = h / HEIGHT;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0b131c';
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, '#79e3cb05');
    shade.addColorStop(STRIDE / WIDTH, '#79e3cb01');
    shade.addColorStop(FIELD / WIDTH, '#f3a38c01');
    shade.addColorStop(1, '#f3a38c05');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a0e2d009';
    ctx.fillRect(sx * STRIDE, 0, sx * (FIELD - STRIDE), h);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#77929320';
    ctx.beginPath();
    if (this.showGrid) {
      for (let x = 1; x < WIDTH; x++) { ctx.moveTo(x * sx, 0); ctx.lineTo(x * sx, h); }
      for (let y = 1; y < HEIGHT; y++) { ctx.moveTo(0, y * sy); ctx.lineTo(w, y * sy); }
    }
    ctx.stroke();
    ctx.strokeStyle = '#a1d9cb40';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(STRIDE * sx, 0); ctx.lineTo(STRIDE * sx, h);
    ctx.moveTo(FIELD * sx, 0); ctx.lineTo(FIELD * sx, h);
    ctx.stroke();
    ctx.setLineDash([]);
    game.board.forEach((row, y) => row.forEach((cell, x) => {
      if (cell) block(ctx, x * sx, y * sy, sx, cell.type, 0.86);
    }));
    const activeCells = game.players.map(p => p.piece ? cells(p.piece) : []);
    if (!game.over) game.players.forEach(p => {
      if (!p.piece) return;
      const ghost = game.ghost(p.id);
      ctx.strokeStyle = OWNER[p.id] + '66';
      ctx.lineWidth = 1;
      for (const [x, y] of cells(ghost)) {
        if (y < 0) continue;
        const inset = p.id === 0 ? 2 : 4;
        rounded(ctx, x * sx + inset, y * sy + inset, sx - inset * 2, sy - inset * 2, 2);
        ctx.stroke();
      }
    });
    if (!game.over) game.players.forEach(p => {
      if (!p.piece) return;
      for (const [x, y] of cells(p.piece)) {
        if (y < 0) continue;
        const overlapping = activeCells[1 - p.id].some(([ox, oy]) => ox === x && oy === y);
        block(ctx, x * sx, y * sy, sx, p.piece.type, overlapping ? 0.65 : 1);
        if (p.piece.relayOwner !== null) {
          ctx.fillStyle = '#14212b';
          ctx.textAlign = 'center';
          ctx.font = `bold ${sx * 0.7}px system-ui`;
          ctx.fillText('⇄', (x + 0.5) * sx, (y + 0.73) * sy);
        }
      }
    });
    const remaining = this.flashUntil - performance.now();
    if (remaining > 0) {
      ctx.fillStyle = `rgba(185,255,225,${remaining / 520})`;
      this.flashRows.forEach(y => ctx.fillRect(0, y * sy, w, sy));
    }
  }

  mini(canvas, items, parked = false) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas.getBoundingClientRect();
    const width = Math.round(w * this.dpr), height = Math.round(h * this.dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!items.length || !items[0]) {
      ctx.strokeStyle = '#7b999544';
      ctx.setLineDash([3, 4]);
      rounded(ctx, w / 2 - 24, h / 2 - 17, 48, 34, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7b999566';
      ctx.font = '22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('+', w / 2, h / 2 + 8);
      return;
    }
    const segment = h / items.length;
    items.forEach((item, index) => {
      const shape = cells({ ...item, x: 0, y: 0, rotation: 0 });
      const minX = Math.min(...shape.map(([x]) => x)), maxX = Math.max(...shape.map(([x]) => x));
      const minY = Math.min(...shape.map(([, y]) => y)), maxY = Math.max(...shape.map(([, y]) => y));
      const size = Math.max(0, Math.min((w - 32) / 4, (segment - 8) / 2)) * (parked || index === 0 ? 1 : 0.86);
      const ox = (w - (maxX - minX + 1) * size) / 2;
      const oy = segment * index + (segment - (maxY - minY + 1) * size) / 2;
      shape.forEach(([x, y]) => block(ctx, ox + (x - minX) * size, oy + (y - minY) * size, size, item.type, index === 0 ? 1 : 0.55));
      if (item.relayOwner !== null) {
        ctx.fillStyle = '#d9efdf';
        ctx.font = '16px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('⇄', ox + (maxX - minX + 1) * size + 6, oy + size);
      }
    });
  }

  updatePreviews(game) {
    game.players.forEach(p => {
      this.mini(this.previews[p.id], p.queue.slice(0, 3));
      this.previews[p.id].setAttribute('aria-label', `Player ${p.id + 1} next pieces: ${p.queue.slice(0, 3).map(item => item.type + (item.relayOwner !== null ? ' relay' : '')).join(', ')}`);
    });
    this.mini(this.hold, game.hold ? [game.hold] : [], true);
    this.hold.setAttribute('aria-label', game.hold ? `Shared parked piece: ${game.hold.type}${game.hold.relayOwner !== null ? ', relay awaiting handoff' : ''}` : 'Shared parked piece, empty');
  }
}
