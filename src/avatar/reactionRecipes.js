/*
 * Reaction recipes
 *
 * Each recipe lays out one reaction on a timeline (milliseconds):
 * anticipation -> impact -> follow-through -> settle. Coordinates are in the
 * avatar SVG's viewBox. The face is never modified; symbols stay beside the
 * head and particles fly around it.
 */

const FACE = { x: 1245, y: 560 };
const EYE_OUTER_L = { x: 1030, y: 590 };
const EYE_OUTER_R = { x: 1462, y: 575 };
const POP_COLORS = ['#ff5b8a', '#ffd23f', '#3fd0ff', '#7be07b', '#b98bff', '#ff9a3c'];

export const REACTION_RECIPES = {
  laugh(ctx, fx) {
    ctx.duration = 1900;
    // Squash, burst upward, then three shrinking laughing beats.
    ctx.camera([
      { t: 110, y: 16, sx: 1.045, sy: .93, ease: 'out' },
      { t: 250, y: -52, sx: .96, sy: 1.09, r: -2, ease: 'out' },
      { t: 420, y: 8, sx: 1.05, sy: .95, r: 3.6 },
      { t: 580, y: -34, sx: .98, sy: 1.05, r: -3.4, ease: 'out' },
      { t: 740, y: 6, sx: 1.04, sy: .96, r: 3 },
      { t: 890, y: -22, sx: .99, sy: 1.03, r: -2.4, ease: 'out' },
      { t: 1040, y: 3, sx: 1.02, sy: .98, r: 1.6 },
      { t: 1220, y: -9, sx: 1, sy: 1.01, r: -.8 },
      { t: 1460, y: 0, sx: 1, sy: 1, r: 0 },
    ]);
    ctx.shake(230, .75, 260);
    ctx.shake(420, .4, 200);
    ctx.shake(740, .32, 200);
    fx.flash({ at: 220, color: '#fff6c8', peak: .45, duration: 240 });
    fx.tint({ at: 200, color: '#ffd84d', opacity: .2, fadeIn: 120, hold: 1100, fadeOut: 420 });
    fx.rays({ at: 200, duration: 1650, colors: ['#ffd24a', '#ff9fbd'], count: 20, opacity: .42, spin: .025 });
    fx.burst({ at: 220, color: '#ff9a3c', count: 28, width: 28 });
    fx.ring({ at: 230, color: '#ffb13d' });
    fx.ring({ at: 560, color: '#ff7aa2', from: 360, to: 1000, width: 22, opacity: .6 });
    fx.text('www', 190, '#ff4f7b', { at: 240, duration: 1420, x: 1880, y: 300, rotate: 10, idle: 'bounce', from: .2 });
    fx.text('www', 132, '#ff8a3d', { at: 380, duration: 1260, x: 640, y: 380, rotate: -12, idle: 'bounce', from: .2 });
    fx.text('ｗｗ', 108, '#f5b400', { at: 520, duration: 1100, x: 1960, y: 640, rotate: 14, idle: 'bounce', from: .2 });
    // Tears burst out of the outer eye corners and fall with gravity.
    fx.emit({
      at: 250, count: 16, over: 820, shape: 'tear', colors: ['#4cc6ff', '#86dcff'], size: [24, 34], life: [560, 780], gravity: 2600, orient: true,
      origin: (i, pose) => {
        const eye = i % 2 ? EYE_OUTER_R : EYE_OUTER_L;
        return ctx.mapPoint(pose, eye.x, eye.y);
      },
      velocity: (i) => ({ x: (i % 2 ? 1 : -1) * (420 + ctx.rand() * 520), y: -(620 + ctx.rand() * 520) }),
    });
    fx.spray({ at: 250, count: 10, shape: 'w', colors: ['#ff4f7b', '#ff8a3d', '#f5b400'], size: [30, 44], speed: [900, 1500], spread: [Math.PI * 1.05, Math.PI * 1.95], gravity: 2200, life: [800, 1000], spin: [-120, 120] });
    fx.spray({ at: 240, count: 14, shape: 'sparkle', colors: ['#fff3a0', '#ffd23f'], size: [16, 28], speed: [700, 1300], gravity: 900, life: [600, 900] });
  },

  surprise(ctx, fx) {
    ctx.duration = 1500;
    // A sharp start: jump and zoom in at once, then settle slowly.
    ctx.camera([
      { t: 80, y: -58, sx: 1.1, sy: 1.13, ease: 'out' },
      { t: 260, y: -14, sx: 1.07, sy: 1.07, ease: 'out' },
      { t: 900, y: -4, sx: 1.04, sy: 1.04 },
      { t: 1250, y: 0, sx: 1, sy: 1 },
    ]);
    ctx.shake(60, .95, 220);
    fx.flash({ at: 0, color: '#fff', peak: .75, duration: 200 });
    fx.tint({ at: 40, color: '#ffe07a', opacity: .2, fadeIn: 80, hold: 900, fadeOut: 380 });
    fx.burst({ at: 40, color: '#2b2340', count: 34, width: 22, from: 460, to: 1700, duration: 380, opacity: .7 });
    fx.ring({ at: 50, color: '#ffd24a', width: 42 });
    fx.text('!?', 300, '#ff7a2f', { at: 60, duration: 1320, x: 1880, y: 300, rotate: 10, idle: 'jitter', ease: 'elastic', inDur: 420 });
    fx.text('!', 190, '#ffb400', { at: 150, duration: 1180, x: 620, y: 330, rotate: -14, idle: 'jitter', ease: 'elastic', inDur: 420 });
    fx.spray({ at: 60, count: 18, shape: 'star', colors: ['#ffd23f', '#ff9a3c', '#fff3a0'], size: [16, 30], speed: [900, 1600], gravity: 1800, life: [700, 950] });
  },

  shy(ctx, fx) {
    ctx.duration = 1700;
    ctx.camera([
      { t: 160, y: -12, sx: 1.035, sy: 1.035, r: -1.5, ease: 'out' },
      { t: 360, y: 4, sx: 1.01, sy: .99, r: 1.2 },
      { t: 560, y: -8, sx: 1.025, sy: 1.025, r: -1 },
      { t: 800, y: 0, sx: 1.015, sy: 1.015, r: .6 },
      { t: 1350, y: 0, sx: 1, sy: 1, r: 0 },
    ]);
    fx.tint({ at: 0, color: '#ff7aa8', opacity: .55, fadeIn: 220, hold: 1000, fadeOut: 420, vignette: true });
    fx.tint({ at: 0, color: '#ffc2d6', opacity: .16, fadeIn: 220, hold: 1000, fadeOut: 420 });
    fx.ring({ at: 60, color: '#ff8fb5', width: 26, opacity: .6 });
    // Blush strokes on the cheeks sit on top of the skin, not on eyes or mouth.
    fx.pop({
      at: 80, duration: 1400, x: 0, y: 0, from: 1, idle: 'none', exit: 'none',
      build: () => {
        const group = fx.el('g', { opacity: '.85' });
        [[1070, 655], [1120, 670], [1370, 640], [1420, 655]].forEach(([x, y]) => group.append(fx.el('line', { x1: x - 26, y1: y + 18, x2: x + 24, y2: y - 14, stroke: '#ff6688', 'stroke-width': 14, 'stroke-linecap': 'round' })));
        return group;
      },
    });
    fx.pop({ at: 100, duration: 1450, x: 1860, y: 330, rotate: 12, idle: 'heartbeat', ease: 'elastic', inDur: 420, build: () => fx.SHAPES.heart(120, '#ff4f8a') });
    fx.pop({ at: 240, duration: 1300, x: 1700, y: 150, rotate: -14, idle: 'heartbeat', ease: 'elastic', inDur: 420, build: () => fx.SHAPES.heart(66, '#ff8fb5') });
    fx.pop({ at: 320, duration: 1250, x: 660, y: 360, rotate: -10, idle: 'heartbeat', ease: 'elastic', inDur: 420, build: () => fx.SHAPES.heart(80, '#ff6f9f') });
    fx.emit({
      at: 120, count: 18, over: 900, shape: 'heart', colors: ['#ff5b8a', '#ff8fb5', '#ffb3cc'], size: [18, 34], life: [900, 1200], gravity: -260, sway: 36, spin: [-40, 40],
      origin: (i) => ({ x: i % 2 ? 1700 + ctx.rand() * 500 : 350 + ctx.rand() * 500, y: 1100 + ctx.rand() * 400 }),
      velocity: () => ({ x: (ctx.rand() - .5) * 120, y: -(300 + ctx.rand() * 260) }),
    });
    fx.spray({ at: 100, count: 10, shape: 'sparkle', colors: ['#fff', '#ffd1e0'], size: [14, 24], speed: [500, 900], gravity: 300, life: [600, 900] });
  },

  angry(ctx, fx) {
    ctx.duration = 1750;
    ctx.camera([
      { t: 90, y: 12, sx: 1.1, sy: 1.1, ease: 'out' },
      { t: 700, y: 8, sx: 1.08, sy: 1.08 },
      { t: 1100, y: 4, sx: 1.05, sy: 1.05 },
      { t: 1450, y: 0, sx: 1, sy: 1 },
    ]);
    ctx.shake(80, 1.05, 520);
    ctx.shake(620, .55, 280);
    fx.flash({ at: 60, color: '#ff2a3d', peak: .45, duration: 240 });
    fx.tint({ at: 60, color: '#ff304f', opacity: .14, fadeIn: 100, hold: 1100, fadeOut: 420 });
    fx.tint({ at: 60, color: '#b8001c', opacity: .62, fadeIn: 100, hold: 1100, fadeOut: 420, vignette: true, layer: 'front' });
    fx.focusLines({ at: 60, duration: 1500, color: '#8a0016', opacity: .5 });
    fx.pop({ at: 100, duration: 1500, x: 1800, y: 250, rotate: 8, idle: 'pulse', ease: 'elastic', inDur: 380, build: () => fx.el('path', { d: fx.anger, transform: 'scale(1.7)', fill: 'none', stroke: '#ef2b2b', 'stroke-width': 20, 'stroke-linecap': 'round' }) });
    fx.pop({ at: 260, duration: 1300, x: 700, y: 300, rotate: -12, idle: 'pulse', ease: 'elastic', inDur: 380, build: () => fx.el('path', { d: fx.anger, fill: 'none', stroke: '#ff5145', 'stroke-width': 20, 'stroke-linecap': 'round' }) });
    fx.text('ムカッ!', 128, '#e3122d', { at: 200, duration: 1400, x: 560, y: 640, rotate: -10, idle: 'jitter', from: 2.2, ease: 'out', inDur: 160 });
    // Steam puffs out of both sides of the head.
    fx.emit({
      at: 150, count: 14, over: 950, shape: 'puff', colors: ['#f4f4f6', '#dcdce2'], size: [22, 36], life: [520, 760], gravity: -400, drag: 2.2, grow: 1.4,
      origin: (i, pose) => ctx.mapPoint(pose, i % 2 ? 1640 : 860, 330),
      velocity: (i) => ({ x: (i % 2 ? 1 : -1) * (650 + ctx.rand() * 350), y: -(180 + ctx.rand() * 220) }),
    });
  },

  gloomy(ctx, fx) {
    ctx.duration = 2100;
    // Slow sink with no bounce. Heavy, not punchy.
    ctx.camera([
      { t: 520, y: 36, sx: 1.01, sy: .97, r: -1.6, ease: 'out' },
      { t: 1550, y: 40, sx: 1.01, sy: .965, r: -1.8 },
      { t: 1950, y: 0, sx: 1, sy: 1, r: 0 },
    ]);
    fx.tint({ at: 0, color: '#1d2f55', opacity: .34, fadeIn: 420, hold: 1150, fadeOut: 450 });
    fx.tint({ at: 0, color: '#0d1a33', opacity: .5, fadeIn: 420, hold: 1150, fadeOut: 450, vignette: true, layer: 'front' });
    fx.gloomLines({ at: 120, duration: 1850 });
    fx.pop({ at: 180, duration: 1800, x: 1240, y: 110, idle: 'bob', dropFrom: 120, ease: 'out', inDur: 380, build: () => fx.el('path', { d: fx.cloud, transform: 'scale(1.35)', fill: '#7187a6', stroke: '#fff', 'stroke-width': 8 }) });
    fx.emit({
      at: 400, count: 26, over: 1300, shape: 'streak', colors: ['#4fb8ec', '#8fd8ff'], size: [22, 30], life: [220, 300], gravity: 1200, orient: true,
      origin: () => ({ x: 1040 + ctx.rand() * 400, y: 230 }),
      velocity: () => ({ x: -120, y: 900 }),
    });
    fx.pop({ at: 360, duration: 1600, x: 1620, y: 440, idle: 'bob', dropFrom: 60, ease: 'out', build: () => fx.SHAPES.tear(30, '#62c7e8'), rotate: 90 });
    fx.text('ずーん…', 118, '#5b6f9c', { at: 300, duration: 1700, x: 1960, y: 560, rotate: 0, dropFrom: 160, ease: 'out', inDur: 520, from: 1, exit: 'fall' });
  },

  relaxed(ctx, fx) {
    ctx.duration = 2000;
    ctx.camera([
      { t: 600, y: -18, sx: 1.018, sy: 1.018, r: .9 },
      { t: 1200, y: -8, sx: 1.01, sy: 1.01, r: -.7 },
      { t: 1850, y: 0, sx: 1, sy: 1, r: 0 },
    ]);
    fx.tint({ at: 0, color: '#8ce7ee', opacity: .2, fadeIn: 360, hold: 1150, fadeOut: 480 });
    fx.tint({ at: 0, color: '#b9f3ff', opacity: .45, fadeIn: 360, hold: 1150, fadeOut: 480, vignette: true });
    fx.ring({ at: 60, duration: 900, color: '#9ae8ff', width: 20, opacity: .55 });
    fx.ring({ at: 380, duration: 900, color: '#f4c9ff', width: 16, opacity: .45 });
    fx.text('〜♪', 150, '#4fb9cc', { at: 160, duration: 1700, x: 1900, y: 420, idle: 'sway', ease: 'elastic', inDur: 500 });
    fx.emit({
      at: 0, count: 22, over: 1100, shape: 'bubble', colors: ['#78dbea', '#b8a4ff', '#ffc2e0'], size: [18, 42], life: [900, 1300], gravity: -300, sway: 40, spin: 0,
      origin: () => ({ x: 250 + ctx.rand() * 2070, y: 1300 + ctx.rand() * 300 }),
      velocity: () => ({ x: 0, y: -(220 + ctx.rand() * 200) }),
    });
    fx.emit({
      at: 200, count: 6, over: 900, shape: 'note', colors: ['#4fb9cc', '#b58cf0'], size: [22, 30], life: [1000, 1200], gravity: -160, sway: 30, spin: [-30, 30],
      origin: () => ({ x: 1600 + ctx.rand() * 300, y: 520 }),
      velocity: () => ({ x: 60 + ctx.rand() * 80, y: -220 }),
    });
  },

  celebrate(ctx, fx) {
    ctx.duration = 2100;
    ctx.camera([
      { t: 120, y: 16, sx: 1.045, sy: .94, ease: 'out' },
      { t: 330, y: -74, sx: .97, sy: 1.08, ease: 'out' },
      { t: 520, y: 8, sx: 1.05, sy: .95, ease: 'in' },
      { t: 680, y: -32, sx: .99, sy: 1.04, ease: 'out' },
      { t: 840, y: 0, sx: 1.02, sy: .98, ease: 'in' },
      { t: 1100, y: 0, sx: 1, sy: 1 },
    ]);
    ctx.shake(520, .5, 200);
    ctx.shake(840, .28, 180);
    ctx.call(300, () => ctx.onShine?.());
    fx.flash({ at: 300, color: '#fff2b0', peak: .6, duration: 240 });
    fx.tint({ at: 250, color: '#ffd45b', opacity: .2, fadeIn: 120, hold: 1250, fadeOut: 450 });
    fx.rays({ at: 250, duration: 1800, colors: ['#ffd24a', '#fff1a8'], count: 24, opacity: .5, spin: .03 });
    fx.ring({ at: 320, color: '#ffc93d', width: 40 });
    fx.pop({ at: 300, duration: 1700, x: 1270, y: 120, idle: 'bob', ease: 'elastic', inDur: 460, build: () => {
      const group = fx.el('g');
      group.append(fx.el('path', { d: fx.crown, fill: '#ffd65c', stroke: '#fff4b8', 'stroke-width': 14, 'stroke-linejoin': 'round' }));
      [[-168, 12], [2, -16], [168, 12]].forEach(([cx, cy]) => group.append(fx.el('circle', { cx, cy, r: 18, fill: '#ff6f8f' })));
      return group;
    } });
    fx.text('やったー!', 132, '#ff5b8a', { at: 380, duration: 1600, x: 1980, y: 520, rotate: 8, idle: 'bounce', ease: 'elastic', inDur: 460 });
    // Confetti cannons from both bottom corners.
    [[260, 1], [2312, -1]].forEach(([x, dir], index) => fx.emit({
      at: 300 + index * 40, count: 30, over: 260, shape: 'confetti', colors: POP_COLORS, size: [26, 40], life: [1200, 1500], gravity: 1500, drag: .9, flip: true,
      origin: () => ({ x, y: 1560 }),
      velocity: () => ({ x: dir * (500 + ctx.rand() * 900), y: -(1700 + ctx.rand() * 900) }),
    }));
    fx.spray({ at: 320, count: 12, shape: 'star', colors: ['#ffd23f', '#fff3a0'], size: [16, 28], speed: [800, 1400], gravity: 1500, life: [700, 1000] });
  },

  welcome(ctx, fx) {
    ctx.duration = 2300;
    ctx.call(0, () => ctx.onGesture?.('nod'));
    ctx.camera([
      { t: 150, y: 10, sx: 1.02, sy: .98, ease: 'out' },
      { t: 330, y: -26, sx: .99, sy: 1.035, ease: 'out' },
      { t: 500, y: 6, sx: 1.01, sy: .99 },
      { t: 680, y: -12, sx: 1, sy: 1.015, ease: 'out' },
      { t: 900, y: 0, sx: 1, sy: 1 },
    ]);
    ctx.shake(330, .25, 160);
    fx.flash({ at: 280, color: '#fff0f5', peak: .35, duration: 220 });
    fx.tint({ at: 200, color: '#ff9ab3', opacity: .45, fadeIn: 200, hold: 1400, fadeOut: 450, vignette: true });
    fx.rays({ at: 250, duration: 2000, colors: ['#ffc2d4', '#fff0c2'], count: 16, opacity: .3, spin: .015 });
    fx.ring({ at: 300, color: '#ff8fb0', width: 30 });
    fx.pop({
      at: 260, duration: 1950, x: 1960, y: 300, rotate: -4, ease: 'elastic', inDur: 520, idle: 'none',
      build: () => {
        const group = fx.el('g');
        group.append(fx.el('path', { d: 'M-290 -130 H290 Q340 -130 340 -80 V80 Q340 130 290 130 H-110 L-240 210 L-212 130 H-290 Q-340 130 -340 80 V-80 Q-340 -130 -290 -130Z', fill: '#fff', stroke: '#ff7b98', 'stroke-width': 14 }));
        return group;
      },
    });
    // Letters hop one after another inside the bubble.
    const letters = [...'WELCOME!'];
    const advance = { W: 104, E: 70, L: 64, C: 76, O: 84, M: 100, '!': 44 };
    const total = letters.reduce((sum, letter) => sum + advance[letter], 0);
    let cursor = 1960 - total / 2;
    letters.forEach((letter, index) => fx.pop({
      at: 420 + index * 45, duration: 1790 - index * 45, x: (cursor += advance[letter]) - advance[letter] / 2, y: 300, from: 0, ease: 'back', inDur: 240, idle: 'bounce', exit: 'shrink',
      build: () => {
        const color = index % 2 ? '#ff8a3d' : '#ff5078';
        return fx.comicText(letter, 104, color, { stroke: color, shadow: 'rgba(255,123,152,.25)' });
      },
    }));
    fx.spray({ at: 300, count: 14, shape: 'star', colors: ['#ffd23f', '#ff8fb0', '#8fd8ff'], size: [16, 30], speed: [800, 1400], gravity: 1500, life: [800, 1100] });
    [[300, 1], [2272, -1]].forEach(([x, dir]) => fx.emit({
      at: 320, count: 14, over: 200, shape: 'confetti', colors: POP_COLORS, size: [22, 34], life: [1100, 1400], gravity: 1500, drag: .9, flip: true,
      origin: () => ({ x, y: 1560 }),
      velocity: () => ({ x: dir * (400 + ctx.rand() * 700), y: -(1400 + ctx.rand() * 700) }),
    }));
  },
};
