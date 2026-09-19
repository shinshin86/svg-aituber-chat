/*
 * SVG Avatar Demo
 * Loads the VTracer-generated SVG (miko.svg), groups paths automatically by
 * facial and body regions, and animates the resulting groups.
 *
 * How it works:
 *  - A gradient-masked transition band around the neck splits copies of the
 *    artwork into head and body regions without exposing a hard seam.
 *  - Eye and mouth paths are detected from bounding boxes, while hair paths
 *    are classified primarily from their colors.
 *  - Group transforms are updated on every animation frame.
 *
 * Debug URL parameters:
 *   ?t=1.5        Freeze the animation time in seconds
 *   ?blink=1      Freeze the avatar during a blink
 *   ?talk=1       Enable the speaking state
 *   ?debug=1      Show region boundaries
 *   ?mx=0.5&my=-0.3  Freeze the pointer position (-1..1)
 *   ?mouth=0.3    Freeze mouth openness (0=closed, 1=original artwork)
 *   ?emotion=happy|sad|angry|surprised|relaxed|neutral  Freeze expression
 *   ?amp=0        Override the motion amplitude
 *   ?flat=1       Render the original SVG without splitting it
 */

const CFG = {
  neckBand: { top: 860, bottom: 1000 }, // Soft head/body transition band in SVG coordinates
  pivot: { x: 1250, y: 930 },           // Neck rotation center
  hairPivot: { x: 1300, y: 250 },       // Hair rotation center near the top of the head
  regions: {
    eyeL:  { x1: 1018, y1: 480, x2: 1190, y2: 650 },
    eyeR:  { x1: 1280, y1: 455, x2: 1470, y2: 640 },
    browL: { x1: 1000, y1: 360, x2: 1200, y2: 470 },
    browR: { x1: 1260, y1: 350, x2: 1485, y2: 455 },
    mouth: { x1: 1140, y1: 690, x2: 1320, y2: 800 },
    face:  { x1: 1020, y1: 380, x2: 1480, y2: 830 }, // Paths fully inside this region are not classified as hair
  },
  baseIndices: [0, 4], // Static full-body silhouette and outline layers
  skin: '#FDE7DA',     // Skin color used by eyelid and mouth overlays
  skinIndex: 2,        // Main face-skin path used to keep overlays away from the bangs
  lineColor: '#3B110C', // Closed-eye and closed-mouth line color
  lineWidth: 5,
  motion: {
    breathPeriod: 4.0, breathPx: 6,
    headPeriod: 5.5, headDeg: 2.0,
    hairPeriod: 1.6, hairDeg: 0.8,
    blinkMin: 2.0, blinkMax: 5.0, blinkDur: 0.18,
    mouseHeadDeg: 2.0, mouseEyePx: 7,
    talkRate: 9,
  },
};

const params = new URLSearchParams(location.search);
const EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral'];
const EMOTION_MOODS = { happy: 'happy', sad: 'calm', angry: 'dramatic', surprised: 'dramatic', relaxed: 'dreamy', neutral: 'neutral' };
const normalizeEmotion = (value) => EMOTIONS.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'neutral';
const state = {
  flags: { breath: true, headSway: true, hairSway: true, blink: true, mouseFollow: true, debug: params.has('debug') },
  amp: params.has('amp') ? parseFloat(params.get('amp')) : 1, speed: 1,
  isSpeaking: false,
  audioMouthOpen: 0,
  mouse: { x: parseFloat(params.get('mx') || '0'), y: parseFloat(params.get('my') || '0') },
  fixedT: params.has('t') ? parseFloat(params.get('t')) : null,
  forceBlink: params.has('blink'),
  forceMouth: params.has('mouth') ? parseFloat(params.get('mouth')) : null, // 0=closed, 1=original artwork
  emotion: normalizeEmotion(params.get('emotion')),
  flat: params.has('flat'), // Render the original SVG without region splitting
  nextBlinkAt: 1.5, blinkStart: -1,
};

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

const inRect = (b, R) => b.x >= R.x1 && b.y >= R.y1 && b.x + b.w <= R.x2 && b.y + b.h <= R.y2;
const isHairColor = (fill) => {
  const { h, s, l } = hexToHsl(fill);
  return l < 0.72 && s > 0.12 && h >= 0 && h <= 45;
};

async function loadSvg(srcUrl) {
  const response = await fetch(srcUrl);
  if (!response.ok) throw new Error(`SVGの取得に失敗しました (${response.status})`);
  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.documentElement;
  const W = parseFloat(src.getAttribute('width')), H = parseFloat(src.getAttribute('height'));
  // Temporarily attach the SVG to the hidden DOM so getBBox() can measure it.
  const probe = document.importNode(src, true);
  probe.setAttribute('viewBox', `0 0 ${W} ${H}`);
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.appendChild(probe);
  const paths = [...probe.querySelectorAll('path')].map((p, i) => {
    const bb = p.getBBox();
    const m = p.transform.baseVal.consolidate();
    const tx = m ? m.matrix.e : 0, ty = m ? m.matrix.f : 0;
    return { i, node: p, fill: p.getAttribute('fill') || '#000000', box: { x: bb.x + tx, y: bb.y + ty, w: bb.width, h: bb.height } };
  });
  probe.remove();
  return { W, H, paths };
}

const overlapRatio = (b, R) => {
  const w = Math.min(b.x + b.w, R.x2) - Math.max(b.x, R.x1);
  const h = Math.min(b.y + b.h, R.y2) - Math.max(b.y, R.y1);
  return (w <= 0 || h <= 0) ? 0 : (w * h) / ((R.x2 - R.x1) * (R.y2 - R.y1));
};

// Classify every path for the head copy while preserving the original paint order.
function classify(paths) {
  const R = CFG.regions, band = CFG.neckBand;
  for (const p of paths) {
    const b = p.box;
    p.inBody = b.y + b.h > band.top;                 // Include in the body copy
    p.inHead = b.y < band.bottom;                    // Include in the head copy
    p.inBand = b.y < band.bottom && b.y + b.h > band.top; // Include in the transition-band base
    let part;
    if (CFG.baseIndices.includes(p.i)) part = 'base';
    else if (inRect(b, R.eyeL)) part = 'eyeL';
    else if (inRect(b, R.eyeR)) part = 'eyeR';
    else if (inRect(b, R.mouth)) part = 'mouth';
    else if (inRect(b, R.face)) part = 'face';
    else if (isHairColor(p.fill)) {
      // Brown paths that substantially overlap the eyes or mouth may contain
      // facial details, so keep them out of the independently moving hair group.
      const ov = Math.max(overlapRatio(b, R.eyeL), overlapRatio(b, R.eyeR), overlapRatio(b, R.mouth));
      part = ov > 0.3 ? 'face' : 'hair';
    } else part = 'face';
    p.part = part;
  }
  const counts = {};
  for (const p of paths) if (p.inHead) counts[p.part] = (counts[p.part] || 0) + 1;
  counts.body = paths.filter(p => p.inBody).length;
  return counts;
}

const MOOD_MATRICES = {
  happy: '1.10 0.04 0 0 0.02  0.02 1.04 0 0 0.01  0 0 0.90 0 0  0 0 0 1 0',
  calm: '0.90 0 0.04 0 0  0 1.03 0.04 0 0.01  0.02 0.04 1.12 0 0.02  0 0 0 1 0',
  dramatic: '1.22 -0.08 -0.05 0 -0.03  -0.05 1.13 -0.05 0 -0.01  -0.04 -0.05 1.18 0 -0.02  0 0 0 1 0',
  dreamy: '1.02 0.04 0.08 0 0.02  0.02 0.96 0.08 0 0.01  0.08 0.02 1.08 0 0.03  0 0 0 1 0',
};
const blendMoodMatrix = (values, amount = .5) => values.split(/\s+/).map((value, index) => {
  const target = Number(value);
  const identity = [0, 6, 12, 18].includes(index) ? 1 : 0;
  return (identity + (target - identity) * amount).toFixed(4);
}).join(' ');

function appendEffectDefinitions(defs, W, H) {
  const filterBox = { filterUnits: 'userSpaceOnUse', x: -120, y: -120, width: W + 240, height: H + 240 };

  const moodFilter = el('filter', { id: 'fxMood', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const moodMatrix = el('feColorMatrix', { type: 'matrix', values: MOOD_MATRICES.happy });
  moodFilter.append(moodMatrix);

  const monoFilter = el('filter', { id: 'fxMonochrome', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  monoFilter.append(el('feColorMatrix', { type: 'saturate', values: 0 }));

  const neonFilter = el('filter', { id: 'fxNeon', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  neonFilter.append(
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 7, result: 'neonBlur' }),
    el('feColorMatrix', {
      in: 'neonBlur',
      type: 'matrix',
      values: '1.4 0 0 0 0.05  0 1.0 0 0 0.06  0 0 1.5 0 0.12  0 0 0 0.75 0',
      result: 'neonColor',
    }),
  );
  const neonMerge = el('feMerge');
  neonMerge.append(el('feMergeNode', { in: 'neonColor' }), el('feMergeNode', { in: 'SourceGraphic' }));
  neonFilter.append(neonMerge);

  const tintFilter = (id, color) => {
    const filter = el('filter', { id, ...filterBox, 'color-interpolation-filters': 'sRGB' });
    const rgb = color === 'cyan' ? [0.05, 0.95, 1] : [1, 0.05, 0.48];
    filter.append(el('feColorMatrix', {
      type: 'matrix',
      values: `0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 .72 0`,
    }));
    return filter;
  };

  const distortionFilter = el('filter', { id: 'fxDistortion', ...filterBox });
  const turbulence = el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '.006 .02', numOctaves: 1, seed: 9, result: 'fxNoise',
  });
  const turbulenceAnimation = el('animate', {
    attributeName: 'baseFrequency', values: '.006 .018;.009 .024;.006 .018', dur: '3.2s', repeatCount: 'indefinite',
  });
  turbulence.append(turbulenceAnimation);
  const displacement = el('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'fxNoise', scale: 0, xChannelSelector: 'R', yChannelSelector: 'B',
  });
  distortionFilter.append(turbulence, displacement);

  const audioGlowFilter = el('filter', { id: 'fxAudioGlow', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const glowDilate = el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 2, result: 'glowDilate' });
  const glowBlur = el('feGaussianBlur', { in: 'glowDilate', stdDeviation: 3, result: 'glowBlur' });
  const glowFlood = el('feFlood', { 'flood-color': '#ff5f86', 'flood-opacity': 0, result: 'glowColor' });
  audioGlowFilter.append(glowDilate, glowBlur, glowFlood, el('feComposite', { in: 'glowColor', in2: 'glowBlur', operator: 'in', result: 'glow' }));
  const glowMerge = el('feMerge');
  glowMerge.append(el('feMergeNode', { in: 'glow' }), el('feMergeNode', { in: 'SourceGraphic' }));
  audioGlowFilter.append(glowMerge);

  const aurora = el('linearGradient', { id: 'fxAurora', gradientUnits: 'userSpaceOnUse', x1: 350, y1: 100, x2: W - 250, y2: H - 100 });
  aurora.append(
    el('stop', { offset: 0, 'stop-color': '#27e4ff' }),
    el('stop', { offset: '.48', 'stop-color': '#b46cff' }),
    el('stop', { offset: 1, 'stop-color': '#ff5e85' }),
    el('animateTransform', { attributeName: 'gradientTransform', type: 'rotate', from: `0 ${W / 2} ${H / 2}`, to: `360 ${W / 2} ${H / 2}`, dur: '8s', repeatCount: 'indefinite' }),
  );
  const scanlines = el('pattern', { id: 'fxScanlines', width: 18, height: 24, patternUnits: 'userSpaceOnUse' });
  scanlines.append(
    el('rect', { x: 0, y: 0, width: 18, height: 7, fill: '#57efff' }),
    el('animateTransform', { attributeName: 'patternTransform', type: 'translate', from: '0 0', to: '0 24', dur: '1.2s', repeatCount: 'indefinite' }),
  );
  const dots = el('pattern', { id: 'fxDots', width: 32, height: 32, patternUnits: 'userSpaceOnUse' });
  dots.append(
    el('circle', { cx: 8, cy: 8, r: 4.5, fill: '#ff4f80' }),
    el('circle', { cx: 24, cy: 24, r: 3, fill: '#4ecfff' }),
    el('animateTransform', { attributeName: 'patternTransform', type: 'translate', from: '0 0', to: '32 32', dur: '4.5s', repeatCount: 'indefinite' }),
  );

  const silhouetteMask = el('mask', { id: 'fxSilhouetteMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H, style: 'mask-type:alpha' });
  silhouetteMask.append(el('use', { href: '#avatarScene' }));
  const revealMask = el('mask', { id: 'fxRevealMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  const revealRect = el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' });
  const revealCircle = el('circle', { cx: W / 2, cy: H * .48, r: 0, fill: '#fff', display: 'none' });
  revealMask.append(revealRect, revealCircle);

  defs.append(
    moodFilter,
    monoFilter,
    neonFilter,
    tintFilter('fxCyan', 'cyan'),
    tintFilter('fxPink', 'pink'),
    distortionFilter,
    audioGlowFilter,
    aurora,
    scanlines,
    dots,
    silhouetteMask,
    revealMask,
  );

  return {
    W, H, moodMatrix, turbulence, turbulenceAnimation, displacement,
    glowDilate, glowBlur, glowFlood, revealRect, revealCircle,
  };
}

function build({ W, H, paths }) {
  const counts = classify(paths);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, xmlns: NS });
  const defs = el('defs');
  const band = CFG.neckBand;
  const grad = (id, from, to) => {
    const g = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: band.top, x2: 0, y2: band.bottom });
    g.append(el('stop', { offset: 0, 'stop-color': from }), el('stop', { offset: 1, 'stop-color': to }));
    return g;
  };
  const mask = (id, gradId) => {
    const m = el('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
    m.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${gradId})` }));
    return m;
  };
  defs.append(grad('gHead', '#fff', '#000'), grad('gBody', '#000', '#fff'), mask('mHead', 'gHead'), mask('mBody', 'gBody'));
  const effectRefs = appendEffectDefinitions(defs, W, H);
  svg.append(defs);

  const clone = (p) => {
    const node = p.node.cloneNode(true);
    node.setAttribute('data-source-index', p.i);
    return node;
  };
  if (state.flat) {
    const g = el('g', { id: 'flat' });
    paths.forEach(p => g.append(clone(p)));
    svg.append(g);
    return { svg, parts: null, counts: { flat: paths.length } };
  }

  // Paint an opaque static base under the transition band so overlapping
  // gradient-masked copies never become translucent.
  const clipBand = el('clipPath', { id: 'cBand' });
  clipBand.append(el('rect', { x: 0, y: band.top, width: W, height: band.bottom - band.top }));
  defs.append(clipBand);
  const gBand = el('g', { id: 'bandBase', 'clip-path': 'url(#cBand)' });
  paths.filter(p => p.inBand).forEach(p => gBand.append(clone(p)));

  const gBody = el('g', { id: 'body' });
  paths.filter(p => p.inBody).forEach(p => gBody.append(clone(p)));
  const bodyWrap = el('g', { mask: 'url(#mBody)' });
  bodyWrap.append(gBody);

  // Preserve paint order by opening a new group whenever the classified part
  // changes. One logical part can therefore contain multiple groups.
  const gHead = el('g', { id: 'head' });
  const parts = { body: [gBody], head: [gHead], base: [], face: [], eyeL: [], eyeR: [], mouth: [], hair: [] };
  let cur = null;
  for (const p of paths) {
    if (!p.inHead) continue;
    if (!cur || cur.part !== p.part) {
      cur = { part: p.part, g: el('g', { class: p.part }) };
      gHead.append(cur.g);
      parts[p.part].push(cur.g);
    }
    cur.g.append(clone(p));
  }

  const R = CFG.regions;
  // Eyelid overlay: skin-colored coverage with a curved closed-eye lower edge.
  const lidShape = (Rr) => {
    const cx = (Rr.x1 + Rr.x2) / 2, w = Rr.x2 - Rr.x1, top = Rr.y1, bottom = Rr.y1 + (Rr.y2 - Rr.y1) * 0.62;
    const x1 = Rr.x1 - w * 0.05, x2 = Rr.x2 + w * 0.05;
    const g = el('g', { class: 'lid' });
    g.append(el('path', { d: `M${x1} ${top - 6} L${x2} ${top - 6} L${x2} ${bottom} Q${cx} ${bottom - 28} ${x1} ${bottom} Z`, fill: CFG.skin }));
    g.append(el('path', { d: `M${x1 + w * 0.08} ${bottom - 2} Q${cx} ${bottom - 30} ${x2 - w * 0.08} ${bottom - 2}`, fill: 'none', stroke: CFG.lineColor, 'stroke-width': CFG.lineWidth, 'stroke-linecap': 'round' }));
    return g;
  };
  // Mouth overlay: skin-colored coverage rising from below, with its top edge
  // acting as a small closed-mouth smile.
  const lipShape = (Rr) => {
    const cx = (Rr.x1 + Rr.x2) / 2, w = Rr.x2 - Rr.x1, top = Rr.y1 + 8, bottom = Rr.y2 + 10;
    // Lower only the closed-mouth line so it sits naturally between the nose
    // and chin. Keep the original open mouth and skin overlay positions intact.
    const closedLineOffsetY = 16;
    const coverTop = top - 16;
    const g = el('g', { class: 'lip' });
    g.append(el('path', { d: `M${Rr.x1} ${coverTop} Q${cx} ${coverTop + 14} ${Rr.x2} ${coverTop} L${Rr.x2} ${bottom} L${Rr.x1} ${bottom} Z`, fill: CFG.skin }));
    // Show the closed-mouth line only near the fully closed state; the animation
    // controls opacity so the line does not remain below a half-open mouth.
    g.append(el('path', { 'data-line': '1', d: `M${Rr.x1 + w * 0.15} ${top - 4 + closedLineOffsetY} Q${cx} ${top + 22 + closedLineOffsetY} ${Rr.x2 - w * 0.15} ${top - 4 + closedLineOffsetY}`, fill: 'none', stroke: CFG.lineColor, 'stroke-width': CFG.lineWidth, 'stroke-linecap': 'round' }));
    return g;
  };
  // Clip each eyelid to the union of the skin and eye paths. Keep the clip on a
  // static wrapper and animate only the eyelid inside it.
  const lidWrap = (name, shapeFn = lidShape, idSuffix = name, includeOverlappingFace = false) => {
    const cp = el('clipPath', { id: 'cLid' + idSuffix, clipPathUnits: 'userSpaceOnUse' });
    const skinPath = paths.find(p => p.i === CFG.skinIndex);
    if (skinPath) cp.append(clone(skinPath));
    paths.filter(p => p.inHead && (p.part === name || (includeOverlappingFace && p.part === 'face' && overlapRatio(p.box, R[name]) > .08))).forEach(p => cp.append(clone(p)));
    defs.append(cp);
    const w = el('g', { 'clip-path': `url(#cLid${idSuffix})` });
    const lid = shapeFn(R[name]);
    w.append(lid);
    gHead.append(w);
    return lid;
  };
  parts.eyeLLid = [lidWrap('eyeL')];
  parts.eyeRLid = [lidWrap('eyeR')];
  parts.mouthLip = [lidWrap('mouth', lipShape)];

  const intersects = (box, region) => box.x < region.x2 && box.x + box.w > region.x1 && box.y < region.y2 && box.y + box.h > region.y1;
  const maskClone = (path, fill) => {
    const node = clone(path);
    node.setAttribute('fill', fill);
    return node;
  };
  // Reproduce the source paint order so covers can only land on visible skin,
  // not on the hair shapes that sit above the broad skin face path.
  const coverMask = (id, regionRect, allowParts = []) => {
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse' });
    mask.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }));
    const skinPath = paths.find(p => p.i === CFG.skinIndex);
    if (skinPath) mask.append(maskClone(skinPath, '#fff'));
    const region = { x1: regionRect.x1 - 12, y1: regionRect.y1 - 12, x2: regionRect.x2 + 12, y2: regionRect.y2 + 12 };
    paths.filter((p) => p.inHead && p.i > CFG.skinIndex && intersects(p.box, region) && !allowParts.includes(p.part))
      .forEach((p) => mask.append(maskClone(p, '#000')));
    paths.filter((p) => p.inHead && p.i > CFG.skinIndex && intersects(p.box, region) && allowParts.includes(p.part))
      .forEach((p) => mask.append(maskClone(p, '#fff')));
    defs.append(mask);
    return `url(#${id})`;
  };
  const maskedWrap = (id, regionRect, allowParts, child) => {
    const wrapper = el('g', { mask: coverMask(id, regionRect, allowParts) });
    wrapper.append(child);
    gHead.append(wrapper);
    return child;
  };

  const eyeCleanupShape = (Rr) => el('ellipse', {
    cx: Rr.x1 + (Rr.x2 - Rr.x1) * .28, cy: Rr.y1 + 112,
    rx: (Rr.x2 - Rr.x1) * .30, ry: 46, fill: CFG.skin,
  });
  const eyeCleanupL = el('g', { class: 'emotion-eye-cleanup', opacity: 0 });
  const eyeCleanupR = el('g', { class: 'emotion-eye-cleanup', opacity: 0 });
  eyeCleanupL.append(eyeCleanupShape(R.eyeL));
  eyeCleanupR.append(eyeCleanupShape(R.eyeR));
  const eyeCleanupLWrap = el('g', { mask: coverMask('mEmotionEyeCleanupL', R.eyeL) });
  const eyeCleanupRWrap = el('g', { mask: coverMask('mEmotionEyeCleanupR', R.eyeR) });
  eyeCleanupLWrap.append(eyeCleanupL);
  eyeCleanupRWrap.append(eyeCleanupR);
  gHead.append(eyeCleanupLWrap, eyeCleanupRWrap);

  const maskedLidWrap = (name, shapeFn, idSuffix) => {
    const lid = shapeFn(R[name]);
    return maskedWrap('m' + idSuffix, R[name], [name], lid);
  };

  const happyLidShape = (Rr) => {
    const cx = (Rr.x1 + Rr.x2) / 2, w = Rr.x2 - Rr.x1, top = Rr.y1, bottom = Rr.y1 + (Rr.y2 - Rr.y1) * 0.62;
    const x1 = Rr.x1 - w * 0.05, x2 = Rr.x2 + w * 0.05;
    const g = el('g', { class: 'lid lid-happy' });
    g.append(
      el('path', { d: `M${x1} ${top - 6} L${x2} ${top - 6} L${x2} ${bottom} L${x1} ${bottom} Z`, fill: CFG.skin }),
      el('path', { 'data-happy-line': '1', d: `M${x1 + w * 0.08} ${bottom - 2} Q${cx} ${bottom - 68} ${x2 - w * 0.08} ${bottom - 2}`, fill: 'none', stroke: CFG.lineColor, 'stroke-width': 8, 'stroke-linecap': 'round' }),
    );
    return g;
  };
  const happyLidL = maskedLidWrap('eyeL', happyLidShape, 'happyEyeL');
  const happyLidR = maskedLidWrap('eyeR', happyLidShape, 'happyEyeR');
  const relaxedLidL = maskedLidWrap('eyeL', lidShape, 'relaxedEyeL');
  const relaxedLidR = maskedLidWrap('eyeR', lidShape, 'relaxedEyeR');
  const browShape = (Rr) => {
    const x1 = Rr.x1 + 25, x2 = Rr.x2 - 25, cx = (x1 + x2) / 2, y = Rr.y1 + 45;
    const cover = el('path', { d: `M${x1 - 18} ${y + 10} Q${cx} ${y - 34} ${x2 + 18} ${y + 8} Q${cx} ${y + 30} ${x1 - 18} ${y + 10} Z`, fill: CFG.skin });
    const brow = el('path', { d: `M${x1} ${y + 9} Q${cx} ${y - 30} ${x2} ${y + 4} Q${cx} ${y + 16} ${x1} ${y + 9} Z`, fill: '#4a251b' });
    const g = el('g', { class: 'emotion-brow', opacity: 0 });
    g.append(cover, brow);
    return g;
  };
  const browL = browShape(R.browL);
  const browR = browShape(R.browR);
  const browLWrap = el('g', { mask: coverMask('mEmotionBrowL', R.browL) });
  const browRWrap = el('g', { mask: coverMask('mEmotionBrowR', R.browR) });
  browLWrap.append(browL); browRWrap.append(browR);
  gHead.append(browLWrap, browRWrap);

  const blushGradient = el('radialGradient', { id: 'fxEmotionBlush', cx: '.5', cy: '.5', r: '.5' });
  blushGradient.append(
    el('stop', { offset: 0, 'stop-color': '#ff6688', 'stop-opacity': '.72' }),
    el('stop', { offset: 1, 'stop-color': '#ff6688', 'stop-opacity': 0 }),
  );
  defs.append(blushGradient);
  const expressionGroup = el('g', { id: 'emotionExpressions', 'pointer-events': 'none' });
  const expressionGroups = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, el('g', { 'data-emotion': emotion, opacity: 0 })]));
  const eyeL = R.eyeL, eyeR = R.eyeR;
  const blush = (group, opacity = '.72') => group.append(
    el('ellipse', { cx: eyeL.x1 + 48, cy: R.face.y2 - 120, rx: 72, ry: 30, fill: 'url(#fxEmotionBlush)', opacity }),
    el('ellipse', { cx: eyeR.x2 - 48, cy: R.face.y2 - 120, rx: 72, ry: 30, fill: 'url(#fxEmotionBlush)', opacity }),
  );
  blush(expressionGroups.happy);
  blush(expressionGroups.sad, '.42');
  blush(expressionGroups.relaxed, '.25');
  const markGroups = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, el('g', { 'data-mark-emotion': emotion })]));
  const markPath = (group, d, attrs = {}) => group.append(el('path', { d, ...attrs }));
  const heartX = eyeR.x2 + 95, heartY = eyeR.y1 - 130;
  markPath(markGroups.happy, `M${heartX} ${heartY + 28} C${heartX - 54} ${heartY - 20} ${heartX - 60} ${heartY + 58} ${heartX} ${heartY + 94} C${heartX + 60} ${heartY + 58} ${heartX + 54} ${heartY - 20} ${heartX} ${heartY + 28} Z`, { fill: '#ff5b92' });
  const sweatX = eyeR.x2 + 100, sweatY = R.face.y2 - 220;
  markPath(markGroups.sad, `M${sweatX} ${sweatY} C${sweatX - 48} ${sweatY + 58} ${sweatX - 38} ${sweatY + 96} ${sweatX} ${sweatY + 96} C${sweatX + 38} ${sweatY + 96} ${sweatX + 48} ${sweatY + 58} ${sweatX} ${sweatY} Z`, { fill: '#42b9d8' });
  const angerX = heartX + 18, angerY = heartY + 52;
  markPath(markGroups.angry, `M${angerX} ${angerY - 22} Q${angerX + 12} ${angerY - 38} ${angerX + 24} ${angerY - 22} M${angerX + 22} ${angerY} Q${angerX + 38} ${angerY + 12} ${angerX + 22} ${angerY + 24} M${angerX} ${angerY + 22} Q${angerX - 12} ${angerY + 38} ${angerX - 24} ${angerY + 22} M${angerX - 22} ${angerY} Q${angerX - 38} ${angerY - 12} ${angerX - 22} ${angerY - 24}`, { fill: 'none', stroke: '#f04d36', 'stroke-width': 10, 'stroke-linecap': 'round' });
  const surpriseX = eyeR.x2 + 125, surpriseY = eyeR.y1 - 125;
  markPath(markGroups.surprised, `M${surpriseX} ${surpriseY} Q${surpriseX + 30} ${surpriseY - 18} ${surpriseX + 60} ${surpriseY} L${surpriseX + 48} ${surpriseY + 70} Q${surpriseX + 30} ${surpriseY + 84} ${surpriseX + 12} ${surpriseY + 70} Z`, { fill: '#ff9d32' });
  markPath(markGroups.surprised, `M${surpriseX + 12} ${surpriseY + 94} Q${surpriseX + 30} ${surpriseY + 78} ${surpriseX + 48} ${surpriseY + 94} Q${surpriseX + 30} ${surpriseY + 112} ${surpriseX + 12} ${surpriseY + 94} Z`, { fill: '#ff9d32' });
  const mouthLine = [...gHead.querySelectorAll('[data-line]')].pop();
  Object.values(expressionGroups).forEach((group) => expressionGroup.append(group));
  Object.values(markGroups).forEach((group) => expressionGroup.append(group));
  gHead.append(expressionGroup);
  const markCenters = {
    happy: [heartX, heartY + 40], sad: [sweatX, sweatY + 48], angry: [angerX, angerY], surprised: [surpriseX + 30, surpriseY + 48], relaxed: [0, 0], neutral: [0, 0],
  };
  const expressionRefs = { groups: expressionGroups, happyLids: [happyLidL, happyLidR], relaxedLids: [relaxedLidL, relaxedLidR], eyeCleanups: [eyeCleanupL, eyeCleanupR], eyeParts: [parts.eyeL, parts.eyeR], brows: { left: browL, right: browR }, markGroups, markCenters, mouthLine };

  const headWrap = el('g', { mask: 'url(#mHead)' });
  headWrap.append(gHead);

  const scene = el('g', { id: 'avatarScene' });
  scene.append(gBand, bodyWrap, headWrap);
  const moodWrap = el('g', { id: 'effectMoodWrap' });
  moodWrap.append(scene);
  const styleWrap = el('g', { id: 'effectStyleWrap' });
  styleWrap.append(moodWrap);
  const distortionWrap = el('g', { id: 'effectDistortionWrap' });
  distortionWrap.append(styleWrap);
  const audioGlowWrap = el('g', { id: 'effectAudioGlowWrap' });
  audioGlowWrap.append(distortionWrap);

  const renderedEffects = el('g', { class: 'effect-rendered' });
  const glitchCyan = el('use', { href: '#avatarScene', class: 'effect-glitch effect-glitch-cyan', filter: 'url(#fxCyan)' });
  const glitchPink = el('use', { href: '#avatarScene', class: 'effect-glitch effect-glitch-pink', filter: 'url(#fxPink)' });
  const patternRect = el('rect', {
    class: 'effect-pattern', x: 0, y: 0, width: W, height: H, mask: 'url(#fxSilhouetteMask)', display: 'none',
  });
  renderedEffects.append(glitchCyan, glitchPink, audioGlowWrap, patternRect);

  // The draw-on effect clones the group structure, removes fills, and animates
  // each path outline in sequence.
  const drawOverlay = scene.cloneNode(true);
  drawOverlay.removeAttribute('id');
  drawOverlay.setAttribute('class', 'effect-draw');
  drawOverlay.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  drawOverlay.querySelectorAll('path').forEach((path) => {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', CFG.lineColor);
    path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('pathLength', '1');
  });

  const revealWrap = el('g', { id: 'effectRevealWrap', mask: 'url(#fxRevealMask)' });
  revealWrap.append(renderedEffects, drawOverlay);
  svg.append(revealWrap);

  // Debug overlays
  const dbg = el('g', { class: 'debug-only', fill: 'none', 'stroke-width': 3 });
  const colors = { eyeL: '#0af', eyeR: '#0af', browL: '#fa0', browR: '#fa0', mouth: '#f0a', face: '#0c0' };
  for (const [name, R] of Object.entries(CFG.regions)) {
    dbg.append(el('rect', { x: R.x1, y: R.y1, width: R.x2 - R.x1, height: R.y2 - R.y1, stroke: colors[name], 'stroke-dasharray': '12 8' }));
  }
  for (const y of [band.top, band.bottom]) dbg.append(el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: '#f80', 'stroke-dasharray': '20 10' }));
  dbg.append(el('circle', { cx: CFG.pivot.x, cy: CFG.pivot.y, r: 12, fill: '#f80' }));
  dbg.append(el('circle', { cx: CFG.hairPivot.x, cy: CFG.hairPivot.y, r: 12, fill: '#c0f' }));
  svg.append(dbg);

  return {
    svg,
    parts,
    counts,
    expressionGroups,
    effects: {
      ...effectRefs,
      scene,
      moodWrap,
      styleWrap,
      distortionWrap,
      audioGlowWrap,
      renderedEffects,
      patternRect,
      drawOverlay,
      revealWrap,
      expression: createExpressionController(expressionRefs, state.emotion),
    },
  };
}

function createExpressionController(expressionRefs, initialEmotion = 'neutral') {
  if (!expressionRefs) return { setEmotion() {}, setBlink() {}, destroy() {} };
  initialEmotion = normalizeEmotion(new URLSearchParams(location.search).get('emotion') || initialEmotion);
  let current = normalizeEmotion(initialEmotion);
  let target = current;
  let weights = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0]));
  weights[current] = 1;
  let frameId = 0;

  const render = () => {
    for (const emotion of EMOTIONS) {
      expressionRefs.groups[emotion].style.opacity = String(weights[emotion]);
      const mark = expressionRefs.markGroups[emotion];
      const center = expressionRefs.markCenters[emotion] ?? [0, 0];
      const scale = .6 + weights[emotion] * .4;
      mark.setAttribute('transform', `translate(${center[0]} ${center[1]}) scale(${scale}) translate(${-center[0]} ${-center[1]})`);
      mark.style.opacity = String(weights[emotion]);
    }
    expressionRefs.happyLids.forEach((lid) => { lid.style.visibility = weights.happy > .01 ? 'visible' : 'hidden'; });
    expressionRefs.relaxedLids.forEach((lid) => { lid.style.visibility = weights.relaxed > .01 ? 'visible' : 'hidden'; });
    const browTransforms = {
      left: { angry: { angle: 14, y: 0 }, sad: { angle: -14, y: 0 }, surprised: { angle: 0, y: -16 } },
      right: { angry: { angle: -14, y: 0 }, sad: { angle: 14, y: 0 }, surprised: { angle: 0, y: -16 } },
    };
    for (const side of ['left', 'right']) {
      const region = side === 'left' ? CFG.regions.browL : CFG.regions.browR;
      const cx = (region.x1 + region.x2) / 2, cy = (region.y1 + region.y2) / 2;
      const transform = Object.entries(browTransforms[side]).reduce((result, [emotion, value]) => ({ angle: result.angle + weights[emotion] * value.angle, y: result.y + weights[emotion] * value.y }), { angle: 0, y: 0 });
      expressionRefs.brows[side].setAttribute('transform', `translate(0 ${transform.y}) rotate(${transform.angle} ${cx} ${cy})`);
      expressionRefs.brows[side].style.opacity = String(1 - weights.neutral);
    }
    const hideOriginalEyes = weights.happy > .01 || weights.relaxed > .01;
    expressionRefs.eyeCleanups.forEach((group, index) => { group.style.opacity = hideOriginalEyes && index === 0 ? '1' : '0'; });
    if (expressionRefs.mouthLine) {
      const top = CFG.regions.mouth.y1 + 8;
      const cx = (CFG.regions.mouth.x1 + CFG.regions.mouth.x2) / 2;
      const x1 = CFG.regions.mouth.x1 + (CFG.regions.mouth.x2 - CFG.regions.mouth.x1) * .15;
      const x2 = CFG.regions.mouth.x2 - (CFG.regions.mouth.x2 - CFG.regions.mouth.x1) * .15;
      const controlOffset = Object.entries({ happy: 54, sad: -3, angry: 8, surprised: 12, relaxed: 25, neutral: 22 })
        .reduce((sum, [emotion, offset]) => sum + weights[emotion] * offset, 0);
      expressionRefs.mouthLine.setAttribute('d', `M${x1} ${top + 12} Q${cx} ${top + controlOffset} ${x2} ${top + 12}`);
    }
  };
  const setBlink = (value, ex = 0, ey = 0) => {
    const expressionClosed = weights.happy > .01 || weights.relaxed > .01;
    const eyeScale = expressionClosed ? .08 : 1 - value * .92;
    const regions = [CFG.regions.eyeL, CFG.regions.eyeR];
    expressionRefs.eyeParts.forEach((groups, index) => {
      const region = regions[index];
      const cx = (region.x1 + region.x2) / 2;
      const lidY = region.y1 + (region.y2 - region.y1) * .62;
      setT(groups, `translate(${ex} ${ey}) ${scaleAbout(cx, lidY, 1, eyeScale)}`);
    });
    render();
  };
  const setEmotion = (value) => {
    const next = normalizeEmotion(value);
    if (next === target) return;
    cancelAnimationFrame(frameId);
    current = target;
    target = next;
    const start = { ...weights };
    const startedAt = performance.now();
    const transition = (now) => {
      const progress = Math.min((now - startedAt) / 220, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      for (const emotion of EMOTIONS) {
        weights[emotion] = start[emotion] * (1 - eased) + (emotion === target ? eased : 0);
      }
      render();
      if (progress < 1) frameId = requestAnimationFrame(transition);
      else current = target;
    };
    frameId = requestAnimationFrame(transition);
  };
  render();
  return {
    setEmotion,
    setBlink,
    destroy() {
      cancelAnimationFrame(frameId);
      current = 'neutral';
    },
  };
}

function createEffectController(svg, effects) {
  if (!effects) {
    return { setEffects() {}, setEmotion() {}, setAudioLevel() {}, replayReveal() {}, destroy() {} };
  }

  let config = {
    visualMode: 'normal', colorMood: 'neutral', audioGlow: false, glitch: false,
    distortion: 'none', pattern: 'none', reveal: 'none', effectIntensity: 1, emotionSync: true,
  };
  let emotion = state.emotion;
  let audioLevel = 0;
  let speaking = false;
  let revealFrameId = 0;
  let revealRunId = 0;

  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);
  const resetReveal = () => {
    cancelAnimationFrame(revealFrameId);
    revealRunId += 1;
    effects.revealRect.setAttribute('display', 'inline');
    effects.revealRect.setAttribute('y', '0');
    effects.revealCircle.setAttribute('display', 'none');
    effects.revealCircle.setAttribute('r', '0');
    effects.renderedEffects.style.opacity = '1';
    effects.drawOverlay.classList.remove('is-running');
    effects.drawOverlay.style.opacity = '1';
    effects.drawOverlay.style.display = 'none';
  };

  const updateAudioGlow = () => {
    if (!config.audioGlow) {
      effects.audioGlowWrap.removeAttribute('filter');
      return;
    }
    effects.audioGlowWrap.setAttribute('filter', 'url(#fxAudioGlow)');
    const intensity = clamp(config.effectIntensity, .25, 2);
    const activeLevel = speaking ? audioLevel : 0;
    effects.glowDilate.setAttribute('radius', String(1.5 + activeLevel * 9 * intensity));
    effects.glowBlur.setAttribute('stdDeviation', String(2.5 + activeLevel * 6 * intensity));
    effects.glowFlood.setAttribute('flood-opacity', String(speaking ? .22 + activeLevel * .68 : .06));
  };

  const setEffects = (next) => {
    config = { ...config, ...next, effectIntensity: clamp(next.effectIntensity ?? config.effectIntensity, .25, 2) };
    const visualMode = ['normal', 'monochrome', 'lineArt', 'neon'].includes(config.visualMode) ? config.visualMode : 'normal';
    const expressionEmotion = config.emotionSync || params.has('emotion') ? emotion : 'neutral';
    effects.expression?.setEmotion(expressionEmotion);
    const requestedMood = config.emotionSync ? EMOTION_MOODS[emotion] : config.colorMood;
    const mood = Object.prototype.hasOwnProperty.call(MOOD_MATRICES, requestedMood) ? requestedMood : 'neutral';
    const distortion = ['cyber', 'water'].includes(config.distortion) ? config.distortion : 'none';
    const pattern = ['aurora', 'scanlines', 'dots'].includes(config.pattern) ? config.pattern : 'none';

    svg.dataset.visualMode = visualMode;
    svg.dataset.glitch = config.glitch ? 'true' : 'false';
    svg.style.setProperty('--effect-intensity', String(config.effectIntensity));

    effects.styleWrap.removeAttribute('filter');
    if (visualMode === 'monochrome') effects.styleWrap.setAttribute('filter', 'url(#fxMonochrome)');
    if (visualMode === 'neon') effects.styleWrap.setAttribute('filter', 'url(#fxNeon)');

    effects.moodWrap.removeAttribute('filter');
    if (mood !== 'neutral') {
      effects.moodMatrix.setAttribute('values', config.emotionSync ? blendMoodMatrix(MOOD_MATRICES[mood]) : MOOD_MATRICES[mood]);
      effects.moodWrap.setAttribute('filter', 'url(#fxMood)');
    }

    effects.distortionWrap.removeAttribute('filter');
    if (distortion !== 'none') {
      const cyber = distortion === 'cyber';
      effects.turbulence.setAttribute('baseFrequency', cyber ? '.008 .11' : '.006 .018');
      effects.turbulenceAnimation.setAttribute('values', cyber ? '.008 .10;.018 .16;.008 .10' : '.006 .018;.009 .024;.006 .018');
      effects.turbulenceAnimation.setAttribute('dur', cyber ? '.7s' : '3.2s');
      effects.displacement.setAttribute('scale', String((cyber ? 8 : 13) * config.effectIntensity));
      effects.distortionWrap.setAttribute('filter', 'url(#fxDistortion)');
      if (typeof effects.turbulenceAnimation.beginElement === 'function') effects.turbulenceAnimation.beginElement();
    }

    if (pattern === 'none') {
      effects.patternRect.setAttribute('display', 'none');
    } else {
      const fillIds = { aurora: 'fxAurora', scanlines: 'fxScanlines', dots: 'fxDots' };
      effects.patternRect.setAttribute('display', 'inline');
      effects.patternRect.setAttribute('fill', `url(#${fillIds[pattern]})`);
      effects.patternRect.style.opacity = String(Math.min(.12 + config.effectIntensity * .16, .48));
    }

    const glowColors = { neutral: '#ff5f86', happy: '#ff8a3d', calm: '#38d8ff', dramatic: '#ff315f', dreamy: '#aa6cff' };
    effects.glowFlood.setAttribute('flood-color', glowColors[mood] ?? glowColors.neutral);
    updateAudioGlow();
  };

  const setEmotion = (value) => {
    emotion = normalizeEmotion(value);
    svg.dataset.emotion = emotion;
    effects.expression?.setEmotion(emotion);
    setEffects(config);
  };

  const animate = (duration, update, complete) => {
    const runId = ++revealRunId;
    const startedAt = performance.now();
    const frame = (now) => {
      if (runId !== revealRunId) return;
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      update(eased, progress);
      if (progress < 1) revealFrameId = requestAnimationFrame(frame);
      else complete?.();
    };
    revealFrameId = requestAnimationFrame(frame);
  };

  const replayReveal = () => {
    resetReveal();
    const duration = 950;
    if (config.reveal === 'wipe') {
      effects.revealRect.setAttribute('y', String(effects.H));
      animate(duration, (eased) => effects.revealRect.setAttribute('y', String(effects.H * (1 - eased))));
      return;
    }
    if (config.reveal === 'iris') {
      effects.revealRect.setAttribute('display', 'none');
      effects.revealCircle.setAttribute('display', 'inline');
      const maxRadius = Math.hypot(effects.W, effects.H) * .58;
      animate(duration, (eased) => effects.revealCircle.setAttribute('r', String(maxRadius * eased)), resetReveal);
      return;
    }
    if (config.reveal === 'draw') {
      effects.drawOverlay.style.display = 'inline';
      effects.renderedEffects.style.opacity = '0';
      requestAnimationFrame(() => effects.drawOverlay.classList.add('is-running'));
      animate(1450, (_eased, progress) => {
        effects.renderedEffects.style.opacity = String(progress < .58 ? 0 : Math.min((progress - .58) / .42, 1));
        effects.drawOverlay.style.opacity = String(progress < .72 ? 1 : Math.max(1 - (progress - .72) / .28, 0));
      }, resetReveal);
    }
  };

  return {
    setEffects,
    setEmotion,
    setAudioLevel(value, isSpeaking) {
      audioLevel = clamp(value, 0, 1);
      speaking = Boolean(isSpeaking);
      updateAudioGlow();
    },
    replayReveal,
    destroy: resetReveal,
  };
}

// ---- animation ----
const tri = (x) => 1 - Math.abs(2 * x - 1); // 0→1→0
function scaleAbout(cx, cy, sx, sy) { return `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`; }
function centerOf(list, fallback) {
  if (!list.length) return fallback;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of list) { x1 = Math.min(x1, p.box.x); y1 = Math.min(y1, p.box.y); x2 = Math.max(x2, p.box.x + p.box.w); y2 = Math.max(y2, p.box.y + p.box.h); }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, top: y1, bottom: y2 };
}

function setT(list, value) { for (const g of list) g.setAttribute('transform', value); }
function setVis(list, visible) { for (const g of list) g.style.visibility = visible ? 'visible' : 'hidden'; }

function startAnimation(parts, paths, expressionController) {
  const M = CFG.motion;
  const of = (name) => paths.filter(p => p.inHead && p.part === name);
  const eyeLc = centerOf(of('eyeL'), { x: 1115, y: 565, top: 480, bottom: 650 });
  const eyeRc = centerOf(of('eyeR'), { x: 1375, y: 545, top: 455, bottom: 640 });
  const mouthc = centerOf(of('mouth'), { x: 1230, y: 745, top: 690, bottom: 800 });
  const t0 = performance.now() / 1000;
  let last = t0;
  let t = 0;

  let animationFrameId = 0;
  let destroyed = false;

  function frame(nowMs) {
    if (destroyed) return;
    const now = nowMs / 1000;
    const dt = Math.min(now - last, 0.1); last = now;
    t = state.fixedT !== null ? state.fixedT : t + dt * state.speed;
    const A = state.amp, F = state.flags;

    // Breathing
    const breath = F.breath ? Math.sin(t * 2 * Math.PI / M.breathPeriod) * M.breathPx * A : 0;
    setT(parts.body, `translate(0 ${breath})`);

    // Head and neck
    let headDeg = F.headSway ? Math.sin(t * 2 * Math.PI / M.headPeriod) * M.headDeg * A : 0;
    if (F.mouseFollow) headDeg += state.mouse.x * M.mouseHeadDeg * A;
    setT(parts.head, `translate(0 ${breath * 0.5}) rotate(${headDeg} ${CFG.pivot.x} ${CFG.pivot.y})`);

    // Hair follows the head with a slight delayed counter-swing.
    const hairDeg = (F.hairSway ? Math.sin(t * 2 * Math.PI / M.hairPeriod) * M.hairDeg * A : 0) - headDeg * 0.35;
    setT(parts.hair, `rotate(${hairDeg} ${CFG.hairPivot.x} ${CFG.hairPivot.y})`);

    // Blinking
    let blinkAmt = 0;
    if (state.forceBlink) blinkAmt = 1;
    else if (F.blink && state.fixedT === null) {
      if (state.blinkStart < 0 && t >= state.nextBlinkAt) state.blinkStart = t;
      if (state.blinkStart >= 0) {
        const p = (t - state.blinkStart) / M.blinkDur;
        if (p >= 1) { state.blinkStart = -1; state.nextBlinkAt = t + M.blinkMin + Math.random() * (M.blinkMax - M.blinkMin); }
        else blinkAmt = tri(p);
      }
    }
    const eyeScale = 1 - blinkAmt * 0.92;
    const ex = F.mouseFollow ? state.mouse.x * M.mouseEyePx * A : 0;
    const ey = F.mouseFollow ? state.mouse.y * M.mouseEyePx * 0.6 * A : 0;
    const RL = CFG.regions.eyeL, RR = CFG.regions.eyeR;
    const lidL = RL.y1 + (RL.y2 - RL.y1) * 0.62; // Closed-eyelid position
    const lidR = RR.y1 + (RR.y2 - RR.y1) * 0.62;
    setT(parts.eyeL, `translate(${ex} ${ey}) ${scaleAbout(eyeLc.x, lidL, 1, eyeScale)}`);
    setT(parts.eyeR, `translate(${ex} ${ey}) ${scaleAbout(eyeRc.x, lidR, 1, eyeScale)}`);
    // Eyelids descend from above by scaling from the top edge of each eye box.
    const lidS = Math.max(blinkAmt, 0.0001);
    setT(parts.eyeLLid, `translate(${ex * 0.3} ${ey * 0.3}) ${scaleAbout((RL.x1 + RL.x2) / 2, RL.y1 - 6, 1, lidS)}`);
    setT(parts.eyeRLid, `translate(${ex * 0.3} ${ey * 0.3}) ${scaleAbout((RR.x1 + RR.x2) / 2, RR.y1 - 6, 1, lidS)}`);
    setVis(parts.eyeLLid, blinkAmt > 0.02); setVis(parts.eyeRLid, blinkAmt > 0.02);
    expressionController?.setBlink(blinkAmt, ex, ey);

    // Mouth: open=1 shows the original artwork and open=0 shows the closed
    // mouth. The skin-colored lip overlay rises from below.
    let open = 0;
    if (state.forceMouth !== null) open = state.forceMouth;
    else if (state.isSpeaking) open = state.audioMouthOpen;
    const RM = CFG.regions.mouth;
    setT(parts.mouth, scaleAbout(mouthc.x, RM.y1 + 8, 1, Math.max(open, 0.0001)));
    const lipS = Math.max(1 - open, 0.0001);
    setT(parts.mouthLip, scaleAbout((RM.x1 + RM.x2) / 2, RM.y2 + 10, 1, lipS));
    setVis(parts.mouthLip, open < 0.98);
    // Fade the closed-mouth line out as openness moves from 0 to 0.2.
    const lipLine = parts.mouthLip[0].querySelector('[data-line]');
    if (lipLine) lipLine.style.opacity = Math.max(0, 1 - open / 0.2).toFixed(2);

    animationFrameId = requestAnimationFrame(frame);
  }
  animationFrameId = requestAnimationFrame(frame);

  return () => {
    destroyed = true;
    cancelAnimationFrame(animationFrameId);
  };
}

/**
 * Mount the existing SVG avatar renderer and expose a small imperative API.
 * Audio analysis stays outside this module; only the normalized mouth value is passed in.
 */
export async function createSvgAvatar(container, srcUrl) {
  state.isSpeaking = false;
  state.audioMouthOpen = 0;
  state.nextBlinkAt = 1.5;
  state.blinkStart = -1;
  state.mouse.x = parseFloat(params.get('mx') || '0');
  state.mouse.y = parseFloat(params.get('my') || '0');

  const data = await loadSvg(srcUrl);
  const { svg, parts, counts, effects } = build(data);
  container.replaceChildren(svg);
  svg.classList.toggle('debug', state.flags.debug);
  const stopAnimation = parts ? startAnimation(parts, data.paths, effects?.expression) : () => {};
  const effectController = createEffectController(svg, effects);
  effectController.setEmotion(state.emotion);

  const handleMouseMove = (event) => {
    if (params.has('mx')) return;
    const rect = container.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };
  const handleMouseLeave = () => {
    if (params.has('mx')) return;
    state.mouse.x = 0;
    state.mouse.y = 0;
  };
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseleave', handleMouseLeave);

  const controller = {
    counts,
    setVoiceLevel(value, isSpeaking) {
      state.audioMouthOpen = Math.min(Math.max(Number(value) || 0, 0), 1);
      state.isSpeaking = Boolean(isSpeaking);
      if (!state.isSpeaking) state.audioMouthOpen = 0;
      effectController.setAudioLevel(state.audioMouthOpen, state.isSpeaking);
    },
    setEmotion(value) {
      const debugEmotion = new URLSearchParams(location.search).get('emotion');
      state.emotion = debugEmotion ? normalizeEmotion(debugEmotion) : normalizeEmotion(value);
      effectController.setEmotion(state.emotion);
    },
    setOptions(options) {
      if (typeof options.amp === 'number') state.amp = options.amp;
      if (typeof options.speed === 'number') state.speed = options.speed;
      for (const key of ['breath', 'headSway', 'hairSway', 'blink', 'mouseFollow']) {
        if (typeof options[key] === 'boolean') state.flags[key] = options[key];
      }
      if (typeof options.debug === 'boolean') {
        state.flags.debug = options.debug;
        svg.classList.toggle('debug', options.debug);
      }
    },
    setEffects(options) {
      effectController.setEffects(options);
    },
    replayReveal() {
      effectController.replayReveal();
    },
    destroy() {
      stopAnimation();
      effects?.expression?.destroy();
      effectController.destroy();
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (svg.parentNode === container) svg.remove();
    },
  };

  window.__avatar = { controller, parts, counts, state };
  return controller;
}
