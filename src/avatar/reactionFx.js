/*
 * Reaction effect engine
 *
 * A reaction is a short timeline built from a recipe: camera moves on the
 * avatar layers, screen shake on the whole SVG, backdrop shapes behind the
 * avatar, symbols and particles in front of it. One requestAnimationFrame loop
 * drives everything, so a reaction can be replaced, cancelled or frozen at a
 * fixed time (?rt=<ms>) without leaving nodes behind.
 *
 * Face parts are never touched. Everything here is layered on top of or
 * behind the artwork.
 */

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
const lerp = (a, b, p) => a + (b - a) * p;
const EASE = {
  linear: (p) => p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
  inOut: (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p) => 1 + 3.4 * Math.pow(p - 1, 3) + 2.4 * Math.pow(p - 1, 2),
  elastic: (p) => (p <= 0 || p >= 1 ? clamp01(p) : Math.pow(2, -9 * p) * Math.sin((p * 9 - .75) * (2 * Math.PI) / 3) + 1),
};

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Smooth pseudo-noise in [-1, 1] for shake and jitter.
const wave = (t, seed) => Math.sin(t * .071 + seed) * .5 + Math.sin(t * .137 + seed * 2.3) * .3 + Math.sin(t * .293 + seed * 4.1) * .2;

const REST = { x: 0, y: 0, sx: 1, sy: 1, r: 0 };
const normalizeKeys = (keys) => {
  let prev = { t: 0, ...REST };
  const out = [prev];
  keys.forEach((key) => {
    prev = { x: prev.x, y: prev.y, sx: prev.sx, sy: prev.sy, r: prev.r, ease: 'inOut', ...key };
    out.push(prev);
  });
  return out;
};
const samplePose = (keys, t) => {
  if (keys.length < 2) return REST;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last;
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i];
    if (t > b.t) continue;
    const a = keys[i - 1];
    const p = (EASE[b.ease] ?? EASE.inOut)(clamp01((t - a.t) / Math.max(b.t - a.t, 1)));
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), sx: lerp(a.sx, b.sx, p), sy: lerp(a.sy, b.sy, p), r: lerp(a.r, b.r, p) };
  }
  return last;
};

// ---------------------------------------------------------------------------
// Shapes

const comicText = (value, size, fill, { stroke = '#fff', shadow = 'rgba(59,17,12,.32)', weight = 900 } = {}) => {
  const group = el('g');
  const attrs = {
    x: 0, y: size * .35, 'font-size': size, 'font-weight': weight, 'font-family': '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif',
    'text-anchor': 'middle', 'paint-order': 'stroke', 'stroke-linejoin': 'round',
  };
  const back = el('text', { ...attrs, x: size * .04, y: size * .35 + size * .06, fill: shadow, stroke: shadow, 'stroke-width': size * .16 });
  const front = el('text', { ...attrs, fill, stroke, 'stroke-width': size * .13 });
  back.textContent = value;
  front.textContent = value;
  group.append(back, front);
  return group;
};

const starPoints = (size, inner = .45, points = 5) => Array.from({ length: points * 2 }, (_, i) => {
  const angle = -Math.PI / 2 + i * Math.PI / points;
  const radius = i % 2 ? size * inner : size;
  return `${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`;
}).join(' ');

const heartPath = (s) => `M0 ${s * .35} C${-s * 1.1} ${-s * .45} ${-s * .55} ${-s * 1.15} 0 ${-s * .45} C${s * .55} ${-s * 1.15} ${s * 1.1} ${-s * .45} 0 ${s * .35}Z`;

const SHAPES = {
  // Tear drop pointing along +x with its tail trailing behind.
  tear: (s, color) => {
    const g = el('g');
    g.append(
      el('path', { d: `M${-s * 2.3} 0 Q${-s * .7} ${-s * .95} 0 ${-s} A${s} ${s} 0 1 1 0 ${s} Q${-s * .7} ${s * .95} ${-s * 2.3} 0Z`, fill: color, stroke: '#fff', 'stroke-width': s * .22 }),
      el('ellipse', { cx: s * .25, cy: -s * .38, rx: s * .32, ry: s * .2, fill: '#fff', opacity: '.85' }),
    );
    return g;
  },
  star: (s, color) => el('polygon', { points: starPoints(s), fill: color, stroke: '#fff', 'stroke-width': s * .14, 'stroke-linejoin': 'round' }),
  sparkle: (s, color) => el('path', { d: `M0 ${-s} Q${s * .12} ${-s * .12} ${s} 0 Q${s * .12} ${s * .12} 0 ${s} Q${-s * .12} ${s * .12} ${-s} 0 Q${-s * .12} ${-s * .12} 0 ${-s}Z`, fill: color }),
  heart: (s, color) => el('path', { d: heartPath(s), fill: color, stroke: '#fff', 'stroke-width': s * .14 }),
  confetti: (s, color) => el('rect', { x: -s * .5, y: -s * .28, width: s, height: s * .56, rx: s * .08, fill: color }),
  petal: (s, color) => el('ellipse', { cx: 0, cy: 0, rx: s * .5, ry: s, fill: color }),
  bubble: (s, color) => {
    const g = el('g');
    g.append(
      el('circle', { r: s, fill: 'rgba(255,255,255,.28)', stroke: color, 'stroke-width': s * .16 }),
      el('ellipse', { cx: -s * .38, cy: -s * .4, rx: s * .22, ry: s * .13, fill: '#fff', transform: `rotate(-35 ${-s * .38} ${-s * .4})` }),
    );
    return g;
  },
  note: (s, color) => comicText('♪', s * 2, color, { shadow: 'rgba(0,0,0,0)' }),
  w: (s, color) => comicText('w', s * 2, color, { shadow: 'rgba(0,0,0,0)' }),
  streak: (s, color) => el('line', { x1: -s * 3.2, y1: 0, x2: 0, y2: 0, stroke: color, 'stroke-width': s * .45, 'stroke-linecap': 'round' }),
  puff: (s, color) => el('circle', { r: s, fill: color, stroke: '#fff', 'stroke-width': s * .12 }),
};

// Four curves bowing toward the center, the classic "vein" anger mark.
const ANGER_MARK = [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sy]) => `M${sx * 16} ${sy * 78} Q${sx * 16} ${sy * 16} ${sx * 78} ${sy * 16}`).join(' ');
const CROWN = 'M-212 75 L-168 -47 L-76 41 L2 -75 L80 41 L175 -47 L212 75 Z';
const CLOUD = 'M-170 20 C-140 -41 -64 -39 -40 -1 C5 -50 92 -31 98 27 C148 17 182 57 160 99 L-162 99 C-202 77 -202 37 -170 20Z';

// ---------------------------------------------------------------------------
// Engine

export function createReactionFx({ svg, W, H, back, front, cameraTargets, pivot, groundHalfWidth = 520, getIntensity = () => 1, fixedTime = null }) {
  let run = null;
  let playCount = 0;
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  const applyCamera = (pose) => {
    const isRest = pose.x === 0 && pose.y === 0 && pose.sx === 1 && pose.sy === 1 && pose.r === 0;
    cameraTargets.forEach((node) => {
      if (!node) return;
      if (isRest) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) translate(${pivot.x} ${pivot.y}) rotate(${pose.r.toFixed(3)}) scale(${pose.sx.toFixed(4)} ${pose.sy.toFixed(4)}) translate(${-pivot.x} ${-pivot.y})`);
    });
  };

  // Maps a point on the artwork through the current camera pose, so particles
  // emitted from the eyes follow the avatar while it moves.
  const mapPoint = (pose, x, y) => {
    const dx = (x - pivot.x) * pose.sx;
    const dy = (y - pivot.y) * pose.sy;
    const rad = pose.r * Math.PI / 180;
    return { x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad) + pose.x, y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad) + pose.y };
  };

  // The artwork is a bust cut off at the bottom edge, so lifting or tilting it
  // would expose that cut. Upward moves become a stretch anchored at the
  // bottom, and tilts are pushed down just enough to keep the corners hidden.
  const groundPose = (pose) => {
    if (pose === REST) return pose;
    const lift = Math.max(-pose.y, 0);
    return {
      x: pose.x,
      y: Math.max(pose.y, 0) + Math.abs(Math.sin(pose.r * Math.PI / 180)) * groundHalfWidth,
      sx: pose.sx + lift / 3000,
      sy: pose.sy + lift / 1050,
      r: pose.r,
    };
  };
  const poseAt = (keys, t) => groundPose(samplePose(keys, t));

  const cleanup = () => {
    if (!run) return;
    cancelAnimationFrame(run.frameId);
    run.actors.forEach((actor) => actor.node?.remove());
    run = null;
    back.replaceChildren();
    front.replaceChildren();
    back.setAttribute('display', 'none');
    front.setAttribute('display', 'none');
    applyCamera(REST);
    svg.style.removeProperty('transform');
  };

  const tick = (t) => {
    if (!run) return;
    const { ctx } = run;
    const pose = ctx.reduced ? REST : poseAt(ctx.cameraKeys, t);
    applyCamera(pose);
    if (!ctx.reduced && ctx.shakes.length) {
      let trauma = 0;
      ctx.shakes.forEach(({ at, amount, decay }) => {
        if (t >= at) trauma += amount * Math.exp(-(t - at) / decay);
      });
      trauma = Math.min(trauma, 1.2);
      const power = trauma * trauma * ctx.amp;
      if (power > .002) svg.style.transform = `translate(${(wave(t, 1.3) * 26 * power).toFixed(2)}px, ${(wave(t, 7.9) * 20 * power).toFixed(2)}px) rotate(${(wave(t, 4.2) * 1.4 * power).toFixed(3)}deg)`;
      else svg.style.removeProperty('transform');
    }
    run.actors.forEach((actor) => {
      const live = t >= actor.start && t < actor.end;
      if (actor.call) {
        if (t >= actor.start && !actor.called) { actor.called = true; if (fixedTime === null) actor.call(); }
        return;
      }
      if (!live) {
        if (actor.node.parentNode) actor.node.remove();
        return;
      }
      if (!actor.node.parentNode) actor.parent.append(actor.node);
      actor.update(t - actor.start, t, pose);
    });
  };

  const play = (recipe, name, hooks = {}) => {
    cleanup();
    playCount += 1;
    const reduced = Boolean(reducedQuery?.matches) || new URLSearchParams(location.search).get('rm') === '1';
    const actors = [];
    const ctx = {
      W, H, reduced,
      amp: Math.min(Math.max(Number(getIntensity()) || 1, .5), 1.6),
      rand: mulberry32(fixedTime === null ? playCount * 7919 : 42),
      cameraKeys: [],
      shakes: [],
      duration: 1600,
      samplePose: (t) => (reduced ? REST : poseAt(ctx.cameraKeys, t)),
      mapPoint,
      add(layer, start, end, node, update) {
        actors.push({ parent: layer === 'back' ? back : front, start, end, node, update });
      },
      call(at, fn) { actors.push({ start: at, end: at, call: fn, called: false }); },
      ...hooks,
    };
    ctx.camera = (keys) => { ctx.cameraKeys = normalizeKeys(keys); };
    ctx.shake = (at, amount, decay = 320) => { ctx.shakes.push({ at, amount, decay }); };
    recipe(ctx, kit(ctx));
    back.setAttribute('display', 'inline');
    front.setAttribute('display', 'inline');
    run = { name, ctx, actors, frameId: 0, startedAt: null };
    if (fixedTime !== null) {
      tick(Math.min(fixedTime, ctx.duration - 1));
      return;
    }
    const frame = (now) => {
      if (!run) return;
      if (run.startedAt === null) run.startedAt = now;
      const t = now - run.startedAt;
      if (t >= ctx.duration) { cleanup(); return; }
      tick(t);
      run.frameId = requestAnimationFrame(frame);
    };
    run.frameId = requestAnimationFrame(frame);
  };

  return {
    play,
    cancel: cleanup,
    destroy: cleanup,
    // Name and progress (0-1) of the running reaction, or null.
    current() {
      if (!run) return null;
      const elapsed = run.startedAt === null ? 0 : performance.now() - run.startedAt;
      return { name: run.name, progress: elapsed / run.ctx.duration };
    },
  };
}

// ---------------------------------------------------------------------------
// Building blocks available to recipes

function kit(ctx) {
  const { W, H, reduced } = ctx;
  const big = { x: -W, y: -H, width: W * 3, height: H * 3 };
  let gradientId = 0;
  const envelope = (local, fadeIn, hold, fadeOut) => {
    if (local < fadeIn) return EASE.out(local / Math.max(fadeIn, 1));
    if (local < fadeIn + hold) return 1;
    return 1 - EASE.in(clamp01((local - fadeIn - hold) / Math.max(fadeOut, 1)));
  };

  const k = {
    // Full-frame color wash. `vignette` draws the color only at the edges.
    tint({ at = 0, color, opacity = .2, fadeIn = 160, hold = 900, fadeOut = 400, layer = 'back', vignette = false }) {
      const group = el('g');
      let fill = color;
      if (vignette) {
        const id = `rfxVignette${Date.now().toString(36)}${gradientId += 1}`;
        const gradient = el('radialGradient', { id, cx: '50%', cy: '42%', r: '62%' });
        gradient.append(
          el('stop', { offset: '.35', 'stop-color': color, 'stop-opacity': 0 }),
          el('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 1 }),
        );
        const defs = el('defs');
        defs.append(gradient);
        group.append(defs);
        fill = `url(#${id})`;
      }
      const rect = el('rect', { ...(vignette ? { x: 0, y: 0, width: W, height: H } : big), fill });
      group.append(rect);
      ctx.add(layer, at, at + fadeIn + hold + fadeOut, group, (local) => {
        group.setAttribute('opacity', (envelope(local, fadeIn, hold, fadeOut) * opacity).toFixed(3));
      });
    },

    // Short bright frame, the "impact" beat.
    flash({ at = 0, color = '#fff', peak = .6, duration = 220 }) {
      if (reduced) return;
      const rect = el('rect', { ...big, fill: color });
      ctx.add('front', at, at + duration, rect, (local) => {
        const p = local / duration;
        rect.setAttribute('opacity', (peak * (p < .15 ? p / .15 : 1 - EASE.out((p - .15) / .85))).toFixed(3));
      });
    },

    // Rotating sunburst behind the avatar.
    rays({ at = 0, duration = 1400, cx = 1250, cy = 560, count = 18, radius = 1900, colors = ['#ffd24a'], opacity = .4, spin = .02 }) {
      const group = el('g');
      colors.forEach((color, ci) => {
        let d = '';
        for (let i = ci; i < count; i += colors.length) {
          const a0 = (i / count) * Math.PI * 2;
          const a1 = ((i + .5) / count) * Math.PI * 2;
          d += `M0 0 L${(Math.cos(a0) * radius).toFixed(1)} ${(Math.sin(a0) * radius).toFixed(1)} L${(Math.cos(a1) * radius).toFixed(1)} ${(Math.sin(a1) * radius).toFixed(1)}Z`;
        }
        group.append(el('path', { d, fill: color }));
      });
      ctx.add('back', at, at + duration, group, (local) => {
        const grow = reduced ? 1 : EASE.back(clamp01(local / 320));
        const rotation = reduced ? 0 : local * spin;
        group.setAttribute('transform', `translate(${cx} ${cy}) rotate(${rotation.toFixed(2)}) scale(${Math.max(grow, .01).toFixed(3)})`);
        group.setAttribute('opacity', (envelope(local, 120, duration - 520, 400) * opacity).toFixed(3));
      });
    },

    // Spikes that shoot outward from a point: the explosion beat.
    burst({ at = 0, duration = 420, cx = 1250, cy = 560, count = 26, from = 380, to = 1500, width = 30, color = '#ff9a3c', layer = 'back', opacity = .85 }) {
      if (reduced) return;
      const path = el('path', { fill: color });
      const angles = Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2 + (ctx.rand() - .5) * .18);
      const lengths = angles.map(() => .7 + ctx.rand() * .5);
      ctx.add(layer, at, at + duration, path, (local) => {
        const p = local / duration;
        const head = EASE.out(clamp01(p * 1.25));
        const tail = EASE.in(clamp01(p));
        let d = '';
        angles.forEach((angle, i) => {
          const rHead = from + (to - from) * head * lengths[i];
          const rTail = from + (to - from) * tail * lengths[i];
          const w = width * (1 - p * .6);
          const nx = -Math.sin(angle) * w, ny = Math.cos(angle) * w;
          const hx = cx + Math.cos(angle) * rHead, hy = cy + Math.sin(angle) * rHead;
          const tx = cx + Math.cos(angle) * rTail, ty = cy + Math.sin(angle) * rTail;
          d += `M${tx.toFixed(1)} ${ty.toFixed(1)} L${(hx + nx).toFixed(1)} ${(hy + ny).toFixed(1)} L${(hx - nx).toFixed(1)} ${(hy - ny).toFixed(1)}Z`;
        });
        path.setAttribute('d', d);
        path.setAttribute('opacity', (opacity * (1 - EASE.in(p))).toFixed(3));
      });
    },

    // Manga focus lines that redraw every few frames so they vibrate.
    focusLines({ at = 0, duration = 1300, cx = 1250, cy = 560, count = 56, inner = [700, 900], color = '#8a0016', opacity = .5, layer = 'back', step = 70 }) {
      const path = el('path', { fill: color });
      let lastStep = -1;
      ctx.add(layer, at, at + duration, path, (local) => {
        const current = reduced ? 0 : Math.floor(local / step);
        if (current !== lastStep) {
          lastStep = current;
          const rand = mulberry32(current * 131 + 17);
          let d = '';
          for (let i = 0; i < count; i += 1) {
            const angle = (i / count) * Math.PI * 2 + (rand() - .5) * .1;
            const r0 = inner[0] + rand() * (inner[1] - inner[0]);
            const r1 = 2400;
            const w = .006 + rand() * .012;
            d += `M${(cx + Math.cos(angle) * r0).toFixed(1)} ${(cy + Math.sin(angle) * r0 * .8).toFixed(1)} L${(cx + Math.cos(angle - w) * r1).toFixed(1)} ${(cy + Math.sin(angle - w) * r1).toFixed(1)} L${(cx + Math.cos(angle + w) * r1).toFixed(1)} ${(cy + Math.sin(angle + w) * r1).toFixed(1)}Z`;
          }
          path.setAttribute('d', d);
        }
        path.setAttribute('opacity', (envelope(local, 80, duration - 380, 300) * opacity).toFixed(3));
      });
    },

    // Expanding shockwave ring.
    ring({ at = 0, duration = 520, cx = 1250, cy = 560, from = 260, to = 1150, width = 34, color = '#ffb13d', opacity = .8, layer = 'back' }) {
      if (reduced) return;
      const circle = el('ellipse', { cx, cy, fill: 'none', stroke: color });
      ctx.add(layer, at, at + duration, circle, (local) => {
        const p = local / duration;
        const r = lerp(from, to, EASE.out(p));
        circle.setAttribute('rx', r.toFixed(1));
        circle.setAttribute('ry', (r * .82).toFixed(1));
        circle.setAttribute('stroke-width', lerp(width, 3, p).toFixed(1));
        circle.setAttribute('opacity', (opacity * (1 - p)).toFixed(3));
      });
    },

    // Vertical "gloom" lines hanging behind the head.
    gloomLines({ at = 0, duration = 1500, x0 = 780, x1 = 1720, count = 14, color = '#3f5680', opacity = .55 }) {
      const group = el('g');
      const lines = Array.from({ length: count }, (_, i) => {
        const x = x0 + (x1 - x0) * (i / (count - 1)) + (ctx.rand() - .5) * 30;
        const length = 380 + ctx.rand() * 420;
        const line = el('line', { x1: x, y1: -20, x2: x, y2: -20, stroke: color, 'stroke-width': 10 + ctx.rand() * 10, 'stroke-linecap': 'round' });
        group.append(line);
        return { line, length, delay: ctx.rand() * 260 };
      });
      ctx.add('back', at, at + duration, group, (local) => {
        lines.forEach(({ line, length, delay }) => {
          const p = reduced ? 1 : EASE.out(clamp01((local - delay) / 420));
          line.setAttribute('y2', (-20 + length * p).toFixed(1));
        });
        group.setAttribute('opacity', (envelope(local, 200, duration - 600, 400) * opacity).toFixed(3));
      });
    },

    // A symbol that pops in with overshoot, idles, then leaves.
    pop({ at = 0, duration = 1200, x, y, rotate = 0, build, from = 0, ease = 'back', inDur = 260, outDur = 240, idle = 'none', exit = 'rise', layer = 'front', dropFrom = 0 }) {
      const wrap = el('g');
      wrap.append(build());
      const seed = ctx.rand() * 10;
      ctx.add(layer, at, at + duration, wrap, (local) => {
        const pIn = clamp01(local / inDur);
        const pOut = clamp01((local - (duration - outDur)) / outDur);
        let scale = reduced ? 1 : lerp(from, 1, EASE[ease](pIn));
        let dx = 0;
        let dy = reduced ? 0 : -dropFrom * (1 - EASE.out(pIn));
        let dr = 0;
        const held = local - inDur;
        if (!reduced && held > 0) {
          if (idle === 'jitter') { dx = wave(local, seed) * 9; dy += wave(local, seed + 3) * 7; }
          if (idle === 'pulse') scale *= 1 + .14 * Math.pow(Math.max(0, Math.sin(held / 150)), 3);
          if (idle === 'heartbeat') { const beat = held % 520; scale *= 1 + (beat < 90 ? .16 * Math.sin(beat / 90 * Math.PI) : beat < 200 ? .1 * Math.sin((beat - 90) / 110 * Math.PI) : 0); }
          if (idle === 'bounce') dy -= Math.abs(Math.sin(held / 150)) * 26;
          if (idle === 'bob') dy += Math.sin(held / 260) * 12;
          if (idle === 'sway') dr = Math.sin(held / 240) * 8;
        }
        if (!reduced) {
          if (exit === 'rise') { dy -= 60 * EASE.in(pOut); scale *= 1 - .2 * pOut; }
          if (exit === 'shrink') scale *= 1 - pOut;
          if (exit === 'fall') dy += 90 * EASE.in(pOut);
        }
        wrap.setAttribute('transform', `translate(${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}) rotate(${(rotate + dr).toFixed(2)}) scale(${Math.max(scale, .001).toFixed(3)})`);
        wrap.setAttribute('opacity', (Math.min(1, local / 60) * (1 - pOut)).toFixed(3));
      });
    },

    text(value, size, fill, options = {}) {
      const { stroke, shadow, ...rest } = options;
      k.pop({ ...rest, build: () => comicText(value, size, fill, { stroke, shadow }) });
    },

    // Physics particles. `origin(i, pose)` and `velocity(i)` are called per
    // particle; `pose` is the camera pose at the particle's birth.
    emit({ at = 0, count = 12, over = 0, shape = 'star', colors = ['#ffd166'], size = [18, 30], life = [700, 1000], origin, velocity, gravity = 1800, drag = 0, spin = [-360, 360], sway = 0, orient = false, flip = false, grow = 0, layer = 'front' }) {
      if (reduced) return;
      const group = el('g');
      const pick = (range) => (Array.isArray(range) ? lerp(range[0], range[1], ctx.rand()) : range);
      const particles = Array.from({ length: count }, (_, i) => {
        const birth = count > 1 ? over * (i / (count - 1)) : 0;
        const o = origin(i, ctx.samplePose(at + birth));
        const v = velocity(i);
        const s = pick(size);
        const node = SHAPES[shape](s, colors[i % colors.length]);
        node.setAttribute('display', 'none');
        group.append(node);
        return { node, birth, life: pick(life), x0: o.x, y0: o.y, vx: v.x, vy: v.y, spin: pick(spin), rot: ctx.rand() * 360, phase: ctx.rand() * Math.PI * 2 };
      });
      const end = over + Math.max(...particles.map((p) => p.life));
      ctx.add(layer, at, at + end, group, (local) => {
        particles.forEach((p) => {
          const age = local - p.birth;
          if (age < 0 || age > p.life) { p.node.setAttribute('display', 'none'); return; }
          p.node.setAttribute('display', 'inline');
          const s = age / 1000;
          const damp = drag > 0 ? (1 - Math.exp(-drag * s)) / drag : s;
          const x = p.x0 + p.vx * damp + (sway ? Math.sin(age / 280 + p.phase) * sway : 0);
          const y = p.y0 + p.vy * damp + .5 * gravity * s * s;
          let angle = p.rot + p.spin * s;
          if (orient) {
            const k2 = drag > 0 ? Math.exp(-drag * s) : 1;
            angle = Math.atan2(p.vy * k2 + gravity * s, p.vx * k2) * 180 / Math.PI;
          }
          const lifeP = age / p.life;
          const scale = Math.min(1, age / 90) * (1 + grow * lifeP);
          const sy = flip ? Math.cos(age / 70 + p.phase) : 1;
          p.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${scale.toFixed(3)} ${(scale * sy).toFixed(3)})`);
          p.node.setAttribute('opacity', (lifeP > .7 ? 1 - (lifeP - .7) / .3 : 1).toFixed(3));
        });
      });
    },

    // Radial burst helper: particles thrown out of a point in all directions.
    // Particles start on a ring (`startRadius`) so they never cover the face.
    spray({ at = 0, count = 16, cx = 1250, cy = 560, startRadius = 430, speed = [700, 1300], spread = [0, Math.PI * 2], ...rest }) {
      const angles = Array.from({ length: count }, (_, i) => lerp(spread[0], spread[1], (i + ctx.rand() * .8) / count));
      const speeds = angles.map(() => lerp(speed[0], speed[1], ctx.rand()));
      k.emit({
        at, count, ...rest,
        origin: (i) => ({ x: cx + Math.cos(angles[i]) * startRadius, y: cy + Math.sin(angles[i]) * startRadius * .85 }),
        velocity: (i) => ({ x: Math.cos(angles[i]) * speeds[i], y: Math.sin(angles[i]) * speeds[i] }),
      });
    },

    anger: ANGER_MARK,
    crown: CROWN,
    cloud: CLOUD,
    heartPath,
    comicText,
    SHAPES,
    el,
  };
  return k;
}
