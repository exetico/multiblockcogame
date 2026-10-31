export class Sound {
  constructor(onError) {
    this.enabled = true;
    this.context = null;
    this.onError = onError;
    this.lastMove = 0;
    this.lastSoftDrop = 0;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio is not supported in this browser.');
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') this.context.resume().catch(error => this.fail(error));
    } catch (error) {
      this.fail(error);
    }
  }

  fail(error) {
    this.enabled = false;
    this.onError(`Sound unavailable: ${error.message}`);
  }

  tone(frequency, start, duration, volume = 0.045, type = 'sine', endFrequency) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.enabled) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, ctx.currentTime + start + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(ctx.currentTime + start);
    oscillator.stop(ctx.currentTime + start + duration + 0.015);
  }

  play(name, count = 1) {
    if (!this.enabled) return;
    switch (name) {
      case 'move':
        if (performance.now() - this.lastMove < 65) return;
        this.lastMove = performance.now();
        this.tone(180, 0, 0.035, 0.012, 'sine');
        break;
      case 'rotate': this.tone(420, 0, 0.065, 0.025, 'sine', 630); break;
      case 'lock': this.tone(130, 0, 0.11, 0.07, 'triangle', 55); break;
      case 'park': this.tone(330, 0, 0.1); this.tone(495, 0.065, 0.14); break;
      case 'request': this.tone(520, 0, 0.11, 0.025); this.tone(520, 0.15, 0.11, 0.025); break;
      case 'exchange':
        [330, 440, 660].forEach((note, i) => this.tone(note, i * 0.055, 0.2, 0.035));
        break;
      case 'clear':
        [330, 440, 554, 660, 880].slice(0, count + 1).forEach((note, i) => this.tone(note, i * 0.055, 0.25, 0.05, 'triangle'));
        break;
      case 'start': [262, 330, 392, 523].forEach((note, i) => this.tone(note, i * 0.08, 0.25)); break;
      case 'over': [330, 294, 247, 165].forEach((note, i) => this.tone(note, i * 0.16, 0.35, 0.05, 'triangle')); break;
      case 'pause': this.tone(300, 0, 0.15, 0.025, 'sine', 200); break;
      case 'resume': this.tone(200, 0, 0.15, 0.025, 'sine', 400); break;
      case 'drop': this.tone(520, 0, 0.1, 0.035, 'triangle', 90); break;
      case 'soft-drop':
        if (performance.now() - this.lastSoftDrop < 90) return;
        this.lastSoftDrop = performance.now();
        this.tone(120, 0, 0.035, 0.01, 'triangle');
        break;
      case 'notice': this.tone(210, 0, 0.08, 0.025); this.tone(175, 0.1, 0.1, 0.025); break;
      case 'level': [523, 659, 784, 1047].forEach((note, i) => this.tone(note, 0.35 + i * 0.09, 0.25, 0.035, 'triangle')); break;
      case 'save': [392, 523, 659].forEach((note, i) => this.tone(note, i * 0.07, 0.16, 0.025)); break;
      case 'load': [659, 523, 784].forEach((note, i) => this.tone(note, i * 0.07, 0.18, 0.025)); break;
    }
  }
}
