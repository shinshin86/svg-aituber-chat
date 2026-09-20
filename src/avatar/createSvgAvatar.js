import { rotateHue } from '../lib/avatarColor';
import { DEFAULT_PATTERN_TEXT, formatPatternText } from '../lib/patternText';

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
 *   ?mouthw=1.25  Freeze mouth width (0.75..1.25)
 *   ?gesture=nod|tilt|jump|laugh&gt=0.35  Freeze a gesture pose
 *   ?thinking=1    Freeze the thinking gaze
 *   ?outline=sticker  Enable the sticker white border
 *   ?visual=halftone|duotone&mood=dramatic  Debug shading styles and mood palette
 *   ?rim=1&visual=poster&aura=1&shadow=1  Enable filter effects
 *   ?reveal=dissolve&rp=0.5  Freeze dissolve progress
 *   ?hue=120&particles=heart&pt=0.5&backdrop=focusLines  Freeze hue, particle, and backdrop effects
 *   ?wobble=full|edge&wseed=3  Show hand-drawn wobble with an optional fixed seed
 *   ?hairfx=stars|stripes|hologram  Show a hair pattern
 *   ?shine=0.5  Hold the diagonal shine at a progress from 0 to 1
 *   ?textfx=1&ptext=こんにちは  Show a flowing text pattern
 *   ?emotion=happy|sad|angry|surprised|relaxed|neutral  Freeze expression
 *   ?comment=cute  Trigger one comment keyword reaction after startup
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
    ear:   { x1: 1495, y1: 500, x2: 1615, y2: 775 },
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
const HAIR_BASE_INDICES = new Set([0, 15, 57]);
const normalizeEmotion = (value) => EMOTIONS.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'neutral';
const state = {
  flags: { breath: true, headSway: true, hairSway: true, blink: true, mouseFollow: true, debug: params.has('debug') },
  amp: params.has('amp') ? parseFloat(params.get('amp')) : 1, speed: 1,
  isSpeaking: false,
  audioMouthOpen: 0,
  audioMouthWidth: params.has('mouthw') ? parseFloat(params.get('mouthw')) : 1,
  mouse: { x: parseFloat(params.get('mx') || '0'), y: parseFloat(params.get('my') || '0') },
  fixedT: params.has('t') ? parseFloat(params.get('t')) : null,
  forceBlink: params.has('blink'),
  forceMouth: params.has('mouth') ? parseFloat(params.get('mouth')) : null, // 0=closed, 1=original artwork
  emotion: normalizeEmotion(params.get('emotion')),
  flat: params.has('flat'), // Render the original SVG without region splitting
  nextBlinkAt: 1.5, blinkStart: -1,
  thinking: params.has('thinking'),
  autoGesture: true,
  gestureName: params.get('gesture') || '',
  gestureStart: -1,
  gestureProgress: params.has('gt') ? Math.min(Math.max(parseFloat(params.get('gt')) || 0, 0), 1) : null,
  playGesture: () => {},
  setThinking: (value) => { state.thinking = Boolean(value); },
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

function applyHairHue(root, degrees) {
  root.querySelectorAll('[data-hue-source]').forEach((path) => {
    const original = path.getAttribute('data-fill0');
    if (original) path.setAttribute('fill', rotateHue(original, degrees));
  });
  root.querySelectorAll('[data-hair-base-overlay]').forEach((path) => {
    path.setAttribute('display', degrees === 0 ? 'none' : 'inline');
  });
}

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
    p.isHairColor = isHairColor(p.fill);
    let part;
    if (CFG.baseIndices.includes(p.i)) part = 'base';
    else if (inRect(b, R.eyeL)) part = 'eyeL';
    else if (inRect(b, R.eyeR)) part = 'eyeR';
    else if (inRect(b, R.mouth)) part = 'mouth';
    else if (inRect(b, R.ear)) part = 'face';
    else if (inRect(b, R.face)) part = 'face';
    else if (p.isHairColor) {
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
const DUOTONE_PALETTES = {
  neutral: ['#1b2a49', '#f5e9d0'],
  happy: ['#7a1f3d', '#ffe9a8'],
  calm: ['#0f3b57', '#d8f3ff'],
  dramatic: ['#2a0a0a', '#ff5a36', '#ffe2c4'],
  dreamy: ['#2d1b4e', '#f7c6ff'],
};
const hexToRgbTable = (colors) => colors.map((color) => {
  const value = color.replace('#', '');
  return [0, 2, 4].map((index) => (parseInt(value.slice(index, index + 2), 16) / 255).toFixed(4));
});
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

  const wobbleFullFilter = el('filter', { id: 'fxWobbleFull', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const wobbleFullNoise = el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '.015', numOctaves: 1, seed: 3, result: 'wobbleFullNoise',
  });
  const wobbleFullDisplacement = el('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'wobbleFullNoise', scale: 0, xChannelSelector: 'R', yChannelSelector: 'B',
  });
  wobbleFullFilter.append(wobbleFullNoise, wobbleFullDisplacement);

  const wobbleEdgeFilter = el('filter', { id: 'fxWobbleEdge', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const wobbleEdgeNoise = el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '.015', numOctaves: 1, seed: 3, result: 'wobbleEdgeNoise',
  });
  const wobbleEdgeDisplacement = el('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'wobbleEdgeNoise', scale: 0, xChannelSelector: 'R', yChannelSelector: 'B', result: 'wobbleEdgeDisplaced',
  });
  const wobbleEdgeErode = el('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: 28, result: 'wobbleEdgeInnerAlpha' });
  const wobbleEdgeBlur = el('feGaussianBlur', { in: 'wobbleEdgeInnerAlpha', stdDeviation: 6, result: 'wobbleEdgeInnerAlphaBlur' });
  const wobbleEdgeInner = el('feComposite', { in: 'SourceGraphic', in2: 'wobbleEdgeInnerAlphaBlur', operator: 'in', result: 'wobbleEdgeInner' });
  const wobbleEdgeMerge = el('feMerge');
  wobbleEdgeMerge.append(el('feMergeNode', { in: 'wobbleEdgeDisplaced' }), el('feMergeNode', { in: 'wobbleEdgeInner' }));
  wobbleEdgeFilter.append(wobbleEdgeNoise, wobbleEdgeDisplacement, wobbleEdgeErode, wobbleEdgeBlur, wobbleEdgeInner, wobbleEdgeMerge);

  const audioGlowFilter = el('filter', { id: 'fxAudioGlow', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const glowDilate = el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 2, result: 'glowDilate' });
  const glowBlur = el('feGaussianBlur', { in: 'glowDilate', stdDeviation: 3, result: 'glowBlur' });
  const glowFlood = el('feFlood', { 'flood-color': '#ff5f86', 'flood-opacity': 0, result: 'glowColor' });
  audioGlowFilter.append(glowDilate, glowBlur, glowFlood, el('feComposite', { in: 'glowColor', in2: 'glowBlur', operator: 'in', result: 'glow' }));
  const glowMerge = el('feMerge');
  glowMerge.append(el('feMergeNode', { in: 'glow' }), el('feMergeNode', { in: 'SourceGraphic' }));
  audioGlowFilter.append(glowMerge);

  const stickerFilter = el('filter', { id: 'fxSticker', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const stickerShadow = el('feDropShadow', { in: 'SourceAlpha', dx: 0, dy: 0, stdDeviation: 4, 'flood-color': '#111827', 'flood-opacity': .25, result: 'stickerShadow' });
  const stickerDilate = el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 9, result: 'stickerDilate' });
  const stickerFlood = el('feFlood', { 'flood-color': '#fff', result: 'stickerWhite' });
  const stickerComposite = el('feComposite', { in: 'stickerWhite', in2: 'stickerDilate', operator: 'in', result: 'stickerOutline' });
  stickerFilter.append(stickerShadow, stickerDilate, stickerFlood, stickerComposite);
  const stickerMerge = el('feMerge');
  stickerMerge.append(el('feMergeNode', { in: 'stickerShadow' }), el('feMergeNode', { in: 'stickerOutline' }), el('feMergeNode', { in: 'SourceGraphic' }));
  stickerFilter.append(stickerMerge);

  const rimFilter = el('filter', { id: 'fxRimLight', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const rimBlur = el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 3, result: 'rimBlur' });
  const rimErode = el('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: 24, result: 'rimErode' });
  const rimEdge = el('feComposite', { in: 'SourceAlpha', in2: 'rimErode', operator: 'out', result: 'rimEdge' });
  const rimGraphicErode = el('feMorphology', { in: 'SourceGraphic', operator: 'erode', radius: 24, result: 'rimGraphicErode' });
  const rimGraphicEdge = el('feComposite', { in: 'SourceGraphic', in2: 'rimGraphicErode', operator: 'out', result: 'rimGraphicEdge' });
  const rimLight = el('feSpecularLighting', {
    in: 'rimBlur', surfaceScale: 1.5, specularConstant: .42, specularExponent: 28,
    'lighting-color': '#fff', result: 'rimSpecular', 'kernelUnitLength': '1 1',
  });
  const rimPoint = el('fePointLight', { x: W * .84, y: H * .18, z: 48 });
  rimLight.append(rimPoint);
  const rimMask = el('feComposite', { in: 'rimSpecular', in2: 'rimEdge', operator: 'in', result: 'rimMasked' });
  const rimFlood = el('feFlood', { 'flood-color': '#fff4df', 'flood-opacity': .7, result: 'rimColor' });
  const rimBand = el('feComposite', { in: 'rimColor', in2: 'rimGraphicEdge', operator: 'in', result: 'rimBand' });
  const rimHalo = el('feDropShadow', { in: 'SourceAlpha', dx: 0, dy: 0, stdDeviation: 5, 'flood-color': '#fff4df', 'flood-opacity': .58, result: 'rimHalo' });
  const rimDilate = el('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 4, result: 'rimDilate' });
  const rimOuter = el('feComposite', { in: 'rimDilate', in2: 'SourceAlpha', operator: 'out', result: 'rimOuter' });
  const rimDirectionOffset = el('feOffset', { in: 'SourceAlpha', dx: -12, dy: 14, result: 'rimDirectionOffset' });
  const rimDirectional = el('feComposite', { in: 'rimOuter', in2: 'rimDirectionOffset', operator: 'out', result: 'rimDirectional' });
  const rimOuterColor = el('feFlood', { 'flood-color': '#fff4df', 'flood-opacity': .55, result: 'rimOuterColor' });
  const rimOuterBand = el('feComposite', { in: 'rimOuterColor', in2: 'rimDirectional', operator: 'in', result: 'rimOuterBand' });
  rimFilter.append(rimBlur, rimErode, rimEdge, rimGraphicErode, rimGraphicEdge, rimLight, rimMask, rimFlood, rimBand, rimHalo, rimDilate, rimOuter, rimDirectionOffset, rimDirectional, rimOuterColor, rimOuterBand);
  const rimMerge = el('feMerge');
  rimMerge.append(el('feMergeNode', { in: 'SourceGraphic' }), el('feMergeNode', { in: 'rimOuterBand' }));
  rimFilter.append(rimMerge);

  const posterFilter = el('filter', { id: 'fxPoster', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const posterTransfer = el('feComponentTransfer', { in: 'SourceGraphic' });
  const posterTable = '0 .2 .4 .6 .8 1';
  posterTransfer.append(
    el('feFuncR', { type: 'discrete', tableValues: posterTable }),
    el('feFuncG', { type: 'discrete', tableValues: posterTable }),
    el('feFuncB', { type: 'discrete', tableValues: posterTable }),
    el('feFuncA', { type: 'identity' }),
  );
  posterFilter.append(posterTransfer);

  const halftoneBaseFilter = el('filter', { id: 'fxHalftoneBase', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const halftoneBaseTransfer = el('feComponentTransfer', { in: 'SourceGraphic' });
  halftoneBaseTransfer.append(
    el('feFuncR', { type: 'linear', slope: 1.08, intercept: .04 }),
    el('feFuncG', { type: 'linear', slope: 1.08, intercept: .04 }),
    el('feFuncB', { type: 'linear', slope: 1.08, intercept: .04 }),
    el('feFuncA', { type: 'identity' }),
  );
  halftoneBaseFilter.append(halftoneBaseTransfer);
  const halftoneLumaFilter = el('filter', { id: 'fxHalftoneLuma', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const halftoneLumaMatrix = el('feColorMatrix', {
    in: 'SourceGraphic', type: 'matrix',
    values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -.2126 -.7152 -.0722 0 1',
    result: 'halftoneLuma',
  });
  const halftoneLumaTransfer = el('feComponentTransfer', { in: 'halftoneLuma' });
  halftoneLumaTransfer.append(el('feFuncA', { type: 'table', tableValues: '1 .72 .18 0' }));
  halftoneLumaFilter.append(halftoneLumaMatrix, halftoneLumaTransfer);
  const halftoneMask = el('mask', { id: 'fxHalftoneMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H, style: 'mask-type:alpha' });
  halftoneMask.append(el('use', { href: '#avatarScene', filter: 'url(#fxHalftoneLuma)' }));
  const halftonePattern = el('pattern', { id: 'fxHalftoneDots', width: 26, height: 26, patternUnits: 'userSpaceOnUse' });
  halftonePattern.append(el('circle', { cx: 13, cy: 13, r: 8, fill: '#3b110c' }));

  const duotoneFilter = el('filter', { id: 'fxDuotone', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const duotoneLuma = el('feColorMatrix', {
    in: 'SourceGraphic', type: 'matrix',
    values: '.2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  .2126 .7152 .0722 0 0  0 0 0 1 0',
    result: 'duotoneLuma',
  });
  const duotoneTransfer = el('feComponentTransfer', { in: 'duotoneLuma' });
  const duotoneFuncs = {
    r: el('feFuncR', { type: 'table', tableValues: '0.1059 0.9608' }),
    g: el('feFuncG', { type: 'table', tableValues: '0.1647 0.9137' }),
    b: el('feFuncB', { type: 'table', tableValues: '0.2863 0.8157' }),
  };
  duotoneTransfer.append(duotoneFuncs.r, duotoneFuncs.g, duotoneFuncs.b, el('feFuncA', { type: 'identity' }));
  duotoneFilter.append(duotoneLuma, duotoneTransfer);

  const dissolveFilter = el('filter', { id: 'fxDissolve', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const dissolveNoise = el('feTurbulence', { type: 'fractalNoise', baseFrequency: '.02', numOctaves: 2, seed: 17, result: 'dissolveNoise', 'color-interpolation-filters': 'sRGB' });
  const dissolveAlphaFixed = el('feColorMatrix', {
    in: 'dissolveNoise', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1', result: 'dissolveNoiseOpaque',
  });
  const dissolveTransfer = el('feComponentTransfer', { in: 'dissolveNoiseOpaque', result: 'dissolveTone' });
  const dissolveRed = el('feFuncR', { type: 'linear', slope: 12, intercept: -9.6, 'color-interpolation-filters': 'sRGB' });
  dissolveTransfer.append(dissolveRed);
  const dissolveMaskMatrix = el('feColorMatrix', {
    in: 'dissolveTone', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0', result: 'dissolveMask',
  });
  const dissolveComposite = el('feComposite', { in: 'SourceGraphic', in2: 'dissolveMask', operator: 'in' });
  dissolveFilter.append(dissolveNoise, dissolveAlphaFixed, dissolveTransfer, dissolveMaskMatrix, dissolveComposite);

  const auraFilter = el('filter', { id: 'fxAura', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  auraFilter.append(
    el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 28, result: 'auraBlur' }),
    el('feFlood', { 'flood-color': '#6b7cff', 'flood-opacity': .62, result: 'auraColor' }),
    el('feComposite', { in: 'auraColor', in2: 'auraBlur', operator: 'in', result: 'aura' }),
  );

  const dropShadowFilter = el('filter', { id: 'fxDropShadow', ...filterBox, 'color-interpolation-filters': 'sRGB' });
  const dropShadowBlur = el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 8, result: 'dropShadowBlur' });
  const dropShadowOffset = el('feOffset', { in: 'dropShadowBlur', dx: 12, dy: 14, result: 'dropShadowOffset' });
  const dropShadowFlood = el('feFlood', { 'flood-color': '#10131c', 'flood-opacity': .35, result: 'dropShadowColor' });
  dropShadowFilter.append(
    dropShadowBlur,
    dropShadowOffset,
    dropShadowFlood,
    el('feComposite', { in: 'dropShadowColor', in2: 'dropShadowOffset', operator: 'in' }),
  );

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
  const textPattern = el('pattern', { id: 'fxTextPattern', width: 744, height: 150, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-20)' });
  const textPatternLine1 = el('text', { x: 0, y: 64, fill: '#fff', 'font-size': 64, 'font-weight': 700, 'font-family': 'sans-serif' });
  const textPatternLine2 = el('text', { x: 372, y: 140, fill: '#fff', 'font-size': 64, 'font-weight': 700, 'font-family': 'sans-serif' });
  textPatternLine1.textContent = DEFAULT_PATTERN_TEXT;
  textPatternLine2.textContent = DEFAULT_PATTERN_TEXT;
  textPattern.append(textPatternLine1, textPatternLine2);

  const hairStars = el('pattern', { id: 'fxHairStars', width: 120, height: 120, patternUnits: 'userSpaceOnUse' });
  hairStars.append(
    el('circle', { cx: 18, cy: 24, r: 16, fill: '#ffffff' }),
    el('circle', { cx: 78, cy: 66, r: 11, fill: '#fff1b8' }),
    el('circle', { cx: 108, cy: 18, r: 8, fill: '#e4c7ff' }),
  );
  const hairStripes = el('pattern', { id: 'fxHairStripes', width: 220, height: 220, patternUnits: 'userSpaceOnUse' });
  hairStripes.append(
    el('path', { d: 'M-110 220 L110 0 M110 330 L330 110', stroke: '#fff', 'stroke-width': 60, opacity: '.7', fill: 'none' }),
  );
  const hairHologram = el('linearGradient', { id: 'fxHairHologram', gradientUnits: 'userSpaceOnUse', x1: 880, y1: 0, x2: 1850, y2: 0 });
  hairHologram.append(
    el('stop', { offset: 0, 'stop-color': '#ff5fa2' }),
    el('stop', { offset: '.24', 'stop-color': '#ffd25f' }),
    el('stop', { offset: '.48', 'stop-color': '#7dff8a' }),
    el('stop', { offset: '.72', 'stop-color': '#5fd2ff' }),
    el('stop', { offset: 1, 'stop-color': '#b57dff' }),
  );
  const shineGradient = el('linearGradient', { id: 'fxShine', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 300, y2: 0 });
  shineGradient.append(
    el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
    el('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '.75' }),
    el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }),
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
    wobbleFullFilter,
    wobbleEdgeFilter,
    audioGlowFilter,
    stickerFilter,
    rimFilter,
    posterFilter,
    halftoneBaseFilter,
    halftoneLumaFilter,
    duotoneFilter,
    dissolveFilter,
    auraFilter,
    dropShadowFilter,
    aurora,
    scanlines,
    dots,
    textPattern,
    hairStars,
    hairStripes,
    hairHologram,
    shineGradient,
    halftoneMask,
    halftonePattern,
    silhouetteMask,
    revealMask,
  );

  return {
    W, H, moodMatrix, turbulence, turbulenceAnimation, displacement,
    wobbleFullNoise, wobbleFullDisplacement, wobbleEdgeNoise, wobbleEdgeDisplacement, wobbleEdgeErode,
    hairStars, hairStripes, hairHologram, shineGradient, halftoneMask, halftonePattern, duotoneFuncs, textPattern, textPatternLine1, textPatternLine2,
    glowDilate, glowBlur, glowFlood, revealRect, revealCircle, dissolveRed, rimPoint, rimDirectionOffset,
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
  const hairBaseClip = el('clipPath', { id: 'cHairBase', clipPathUnits: 'userSpaceOnUse' });
  hairBaseClip.append(
    el('rect', { x: 500, y: 0, width: 1520, height: 620 }),
    el('rect', { x: 500, y: 300, width: 520, height: 680 }),
    el('rect', { x: 1480, y: 240, width: 540, height: 740 }),
  );
  defs.append(hairBaseClip);
  const effectRefs = appendEffectDefinitions(defs, W, H);
  svg.append(defs);

  const clone = (p, allowBaseHue = false) => {
    const node = p.node.cloneNode(true);
    node.setAttribute('data-source-index', p.i);
    node.setAttribute('data-fill0', p.fill);
    if ((HAIR_BASE_INDICES.has(p.i) && p.i !== 0) || (p.part === 'hair' && p.inHead && p.box.y < CFG.neckBand.top) || (allowBaseHue && p.i === 0)) node.setAttribute('data-hue-source', 'hair');
    if (allowBaseHue && p.i === 0) node.setAttribute('clip-path', 'url(#cHairBase)');
    node.setAttribute('data-i', p.i);
    return node;
  };
  const hairBaseMask = el('mask', { id: 'mHairBase', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  hairBaseMask.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }));
  paths.filter((p) => p.part === 'hair').forEach((p) => {
    const node = p.node.cloneNode(true);
    node.setAttribute('fill', '#fff');
    node.setAttribute('stroke', '#fff');
    node.setAttribute('stroke-width', '120');
    node.setAttribute('stroke-linejoin', 'round');
    hairBaseMask.append(node);
  });
  defs.append(hairBaseMask);
  const hairPatternBaseNodes = [];
  const cloneHairPatternBaseOverlay = () => {
    const wrapper = el('g', { class: 'hair-pattern-base-overlay', mask: 'url(#mHairBase)', display: 'none' });
    const shape = el('g', { mask: 'url(#mHairBaseShape)' });
    const rect = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#fxHairStars)' });
    shape.append(rect);
    wrapper.append(shape);
    hairPatternBaseNodes.push({ rect, wrapper });
    return wrapper;
  };
  const hairPathsMask = el('mask', { id: 'mHairPaths', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  hairPathsMask.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }));
  paths.filter((p) => p.part === 'hair').forEach((p) => {
    const node = p.node.cloneNode(true);
    node.setAttribute('fill', '#fff');
    node.setAttribute('stroke', 'none');
    hairPathsMask.append(node);
  });
  // Hair patterns must never reach the neck, shoulders, or clothing below the band.
  hairPathsMask.append(el('rect', { x: 0, y: CFG.neckBand.bottom, width: W, height: H - CFG.neckBand.bottom, fill: '#000' }));
  const hairBaseShapeMask = el('mask', { id: 'mHairBaseShape', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
  hairBaseShapeMask.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#000' }));
  const baseShape = paths.find((p) => p.i === 0).node.cloneNode(true);
  baseShape.setAttribute('fill', '#fff');
  baseShape.setAttribute('stroke', 'none');
  hairBaseShapeMask.append(baseShape);
  defs.append(hairPathsMask, hairBaseShapeMask);
  const cloneHairBaseOverlay = () => {
    const base = paths.find((p) => p.i === 0);
    const node = clone(base);
    node.setAttribute('data-hair-base-overlay', '1');
    node.setAttribute('data-hue-source', 'hair');
    node.setAttribute('display', 'none');
    const wrapper = el('g', { mask: 'url(#mHairBase)' });
    wrapper.append(node);
    return wrapper;
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
  paths.filter(p => p.inBand).forEach((p) => {
    gBand.append(clone(p));
    if (p.i === 0) gBand.append(cloneHairBaseOverlay(), cloneHairPatternBaseOverlay());
  });

  const gBody = el('g', { id: 'body' });
  paths.filter(p => p.inBody).forEach((p) => {
    gBody.append(clone(p));
    if (p.i === 0) gBody.append(cloneHairBaseOverlay(), cloneHairPatternBaseOverlay());
  });
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
    cur.g.append(clone(p, p.part === 'hair' && p.inHead));
    if (p.i === 0) cur.g.append(cloneHairBaseOverlay(), cloneHairPatternBaseOverlay());
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
    const brow = el('path', { d: `M${x1} ${y + 9} Q${cx} ${y - 30} ${x2} ${y + 4} Q${cx} ${y + 16} ${x1} ${y + 9} Z`, fill: '#4a251b', 'data-fill0': '#4a251b', 'data-hue-source': 'brow' });
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
  const hairPatternOverlay = el('g', { class: 'effect-hair-pattern', display: 'none', opacity: '.55', mask: 'url(#mHairPaths)', 'pointer-events': 'none' });
  const hairPatternOverlayRect = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#fxHairStars)' });
  hairPatternOverlay.append(hairPatternOverlayRect);
  gHead.append(hairPatternOverlay);
  const markCenters = {
    happy: [heartX, heartY + 40], sad: [sweatX, sweatY + 48], angry: [angerX, angerY], surprised: [surpriseX + 30, surpriseY + 48], relaxed: [0, 0], neutral: [0, 0],
  };
  const expressionRefs = { groups: expressionGroups, happyLids: [happyLidL, happyLidR], relaxedLids: [relaxedLidL, relaxedLidR], eyeCleanups: [eyeCleanupL, eyeCleanupR], eyeParts: [parts.eyeL, parts.eyeR], brows: { left: browL, right: browR }, markGroups, markCenters, mouthLine };

  const headWrap = el('g', { mask: 'url(#mHead)' });
  headWrap.append(gHead);

  const scene = el('g', { id: 'avatarScene' });
  const gestureWrap = el('g', { id: 'avatarGestureWrap' });
  gestureWrap.append(gBand, bodyWrap, headWrap);
  scene.append(gestureWrap);
  // Resolve the luminance mask after the referenced scene exists in the SVG tree.
  effectRefs.halftoneMask.replaceChildren(el('use', { href: '#avatarScene', filter: 'url(#fxHalftoneLuma)' }));
  const moodWrap = el('g', { id: 'effectMoodWrap' });
  moodWrap.append(scene);
  const styleWrap = el('g', { id: 'effectStyleWrap' });
  styleWrap.append(moodWrap);
  const outlineWrap = el('g', { id: 'effectOutlineWrap' });
  outlineWrap.append(styleWrap);
  const distortionWrap = el('g', { id: 'effectDistortionWrap' });
  distortionWrap.append(outlineWrap);
  const rimLightWrap = el('g', { id: 'effectRimLightWrap' });
  rimLightWrap.append(distortionWrap);
  const audioGlowWrap = el('g', { id: 'effectAudioGlowWrap' });
  audioGlowWrap.append(rimLightWrap);
  const wobbleWrap = el('g', { id: 'effectWobbleWrap' });
  wobbleWrap.append(audioGlowWrap);

  const backgroundEffects = el('g', { id: 'effectBackgroundWrap' });
  const auraUse = el('use', { href: '#avatarScene', filter: 'url(#fxAura)', opacity: '.48', display: 'none' });
  const dropShadow = el('use', { href: '#avatarScene', filter: 'url(#fxDropShadow)', display: 'none' });
  backgroundEffects.append(dropShadow, auraUse);

  const renderedEffects = el('g', { class: 'effect-rendered' });
  const glitchCyan = el('use', { href: '#avatarScene', class: 'effect-glitch effect-glitch-cyan', filter: 'url(#fxCyan)' });
  const glitchPink = el('use', { href: '#avatarScene', class: 'effect-glitch effect-glitch-pink', filter: 'url(#fxPink)' });
  const patternRect = el('rect', {
    class: 'effect-pattern', x: 0, y: 0, width: W, height: H, mask: 'url(#fxSilhouetteMask)', display: 'none',
  });
  const halftoneRect = el('rect', {
    class: 'effect-halftone', x: 0, y: 0, width: W, height: H, fill: 'url(#fxHalftoneDots)', mask: 'url(#fxHalftoneMask)', display: 'none', opacity: '.9',
  });
  const halftoneClip = el('clipPath', { id: 'fxHalftoneClip', clipPathUnits: 'userSpaceOnUse' });
  paths.filter((path) => !CFG.baseIndices.includes(path.i) && path.box.w < W * .9 && path.box.h < H * .95)
    .forEach((path) => halftoneClip.append(path.node.cloneNode(true)));
  defs.append(halftoneClip);
  const halftoneWrap = el('g', { class: 'effect-halftone-wrap', mask: 'url(#fxSilhouetteMask)', 'clip-path': 'url(#fxHalftoneClip)', display: 'none', 'pointer-events': 'none' });
  halftoneWrap.append(halftoneRect);
  const halftoneOverlay = el('g', { class: 'effect-halftone-overlay', display: 'none', opacity: '.82', 'pointer-events': 'none' });
  const pathLuma = (fill) => {
    const value = String(fill || '').replace('#', '');
    if (value.length !== 6) return 1;
    const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  paths.filter((path) => !CFG.baseIndices.includes(path.i) && pathLuma(path.fill) < .62).forEach((path) => {
    const node = path.node.cloneNode(true);
    node.setAttribute('fill', 'url(#fxHalftoneDots)');
    node.setAttribute('stroke', 'none');
    halftoneOverlay.append(node);
  });
  const textPatternWrap = el('g', { class: 'effect-text-pattern', mask: 'url(#fxSilhouetteMask)', display: 'none', opacity: '.34', 'pointer-events': 'none' });
  const textPatternRect = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#fxTextPattern)' });
  textPatternWrap.append(textPatternRect);
  const shineWrap = el('g', { id: 'effectShineWrap', display: params.has('shine') ? 'inline' : 'none', mask: 'url(#fxSilhouetteMask)', 'pointer-events': 'none' });
  const shineBand = el('rect', { x: -150, y: -H * .2, width: 300, height: H * 1.4, fill: 'url(#fxShine)', transform: `rotate(45 ${W / 2} ${H / 2})` });
  shineWrap.append(shineBand);
  renderedEffects.append(glitchCyan, glitchPink, wobbleWrap, patternRect, halftoneOverlay, textPatternWrap);

  const backdropPattern = el('pattern', { id: 'fxHalftone', width: 32, height: 32, patternUnits: 'userSpaceOnUse' });
  backdropPattern.append(el('circle', { cx: 10, cy: 10, r: 10, fill: '#ff6b9d', opacity: '.35' }));
  defs.append(backdropPattern);
  const backdropGroup = el('g', { id: 'avatarBackdrop', display: 'none', 'pointer-events': 'none' });
  const focusLines = el('g', { 'data-backdrop': 'focusLines', fill: params.get('bg') === 'dark' ? '#f4d8e6' : '#3B110C', opacity: '.55' });
  for (let i = 0; i < 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2;
    const inner = W * (.22 + (i % 5) * .008);
    const outer = W * (.58 + ((i * 17) % 23) / 100);
    const width = .008 + ((i * 13) % 7) / 1000;
    const cx = W / 2, cy = H * .47;
    const p1 = `${cx + Math.cos(angle - width) * inner} ${cy + Math.sin(angle - width) * inner}`;
    const p2 = `${cx + Math.cos(angle - width * .2) * outer} ${cy + Math.sin(angle - width * .2) * outer}`;
    const p3 = `${cx + Math.cos(angle + width * .2) * outer} ${cy + Math.sin(angle + width * .2) * outer}`;
    const p4 = `${cx + Math.cos(angle + width) * inner} ${cy + Math.sin(angle + width) * inner}`;
    focusLines.append(el('path', { d: `M${p1} L${p2} L${p3} L${p4} Z` }));
  }
  const halftone = el('rect', { 'data-backdrop': 'halftone', x: 0, y: 0, width: W, height: H, fill: 'url(#fxHalftone)', opacity: '.5' });
  backdropGroup.append(focusLines, halftone);

  // The draw-on effect clones the group structure, removes fills, and animates
  // each path outline in sequence.
  const drawOverlay = scene.cloneNode(true);
  drawOverlay.removeAttribute('id');
  drawOverlay.setAttribute('class', 'effect-draw');
  drawOverlay.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  drawOverlay.querySelectorAll('[data-hair-base-overlay], [data-hair-pattern-base], .hair-pattern-base-overlay').forEach(node => node.remove());
  drawOverlay.querySelectorAll('path').forEach((path) => {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', CFG.lineColor);
    path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.setAttribute('pathLength', '1');
  });

  const revealWrap = el('g', { id: 'effectRevealWrap', mask: 'url(#fxRevealMask)' });
  revealWrap.append(backdropGroup, backgroundEffects, renderedEffects, drawOverlay);
  svg.append(revealWrap);
  // Keep the one-shot shine outside the reveal mask so it remains visible at a fixed debug progress.
  svg.append(shineWrap);
  const particleGroup = el('g', { id: 'avatarParticles', 'pointer-events': 'none' });
  svg.append(particleGroup);

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
      gestureWrap,
      moodWrap,
      styleWrap,
      outlineWrap,
      distortionWrap,
      rimLightWrap,
      audioGlowWrap,
      wobbleWrap,
      auraUse,
      dropShadow,
      renderedEffects,
      patternRect,
      halftoneRect,
      halftoneWrap,
      halftoneOverlay,
      textPatternWrap,
      textPattern: effectRefs.textPattern,
      textPatternLine1: effectRefs.textPatternLine1,
      textPatternLine2: effectRefs.textPatternLine2,
      duotoneFuncs: effectRefs.duotoneFuncs,
      hairPatternOverlay,
      hairPatternOverlayRect,
      hairPatternBaseNodes,
      hairStars: effectRefs.hairStars,
      hairStripes: effectRefs.hairStripes,
      hairHologram: effectRefs.hairHologram,
      shineBand,
      shineWrap,
      drawOverlay,
      revealWrap,
      backdropGroup,
      particleGroup,
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
    for (const emotion of EMOTIONS) weights[emotion] = Math.max(0, Math.min(weights[emotion], 1));
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
    let startedAt = null;
    const transition = (now) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(Math.max((now - startedAt) / 220, 0), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      for (const emotion of EMOTIONS) {
        weights[emotion] = start[emotion] * (1 - eased) + (emotion === target ? eased : 0);
      }
      if (progress >= 1) {
        for (const emotion of EMOTIONS) weights[emotion] = emotion === target ? 1 : 0;
        current = target;
      }
      render();
      if (progress < 1) frameId = requestAnimationFrame(transition);
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
    return { setEffects() {}, setEmotion() {}, setAudioLevel() {}, setPatternText() {}, playShine() {}, replayReveal() {}, destroy() {} };
  }

  let config = {
    visualMode: 'normal', colorMood: 'neutral', audioGlow: false, glitch: false,
    outline: 'none', rimLight: false, aura: false, dropShadow: false,
    distortion: 'none', pattern: 'none', reveal: 'none', effectIntensity: 1, emotionSync: true,
    hairHueShift: 0, emotionParticles: false, backdrop: 'none', wobble: 'none', textPattern: false,
  };
  let emotion = state.emotion;
  let audioLevel = 0;
  let speaking = false;
  let revealFrameId = 0;
  let revealRunId = 0;
  let particleFrameId = 0;
  let wobbleFrameId = 0;
  let wobbleLastAt = -Infinity;
  let wobbleSeed = 3;
  let hairPatternFrameId = 0;
  let hairPatternLastAt = -Infinity;
  let shineFrameId = 0;
  let shineRunId = 0;
  let debugShineStarted = false;
  let debugParticlesStarted = false;
  let debugTextPatternStarted = false;
  let textPatternFrameId = 0;
  let currentPatternText = DEFAULT_PATTERN_TEXT;

  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);
  const resetReveal = () => {
    cancelAnimationFrame(revealFrameId);
    revealRunId += 1;
    effects.revealRect.setAttribute('display', 'inline');
    effects.revealRect.setAttribute('y', '0');
    effects.revealCircle.setAttribute('display', 'none');
    effects.revealCircle.setAttribute('r', '0');
    effects.renderedEffects.style.opacity = '1';
    effects.renderedEffects.removeAttribute('filter');
    effects.scene.removeAttribute('filter');
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

  const stopWobbleLoop = () => {
    cancelAnimationFrame(wobbleFrameId);
    wobbleFrameId = 0;
  };

  const updateWobbleLoop = (mode, intensity) => {
    stopWobbleLoop();
    if (mode === 'none') {
      effects.wobbleWrap.removeAttribute('filter');
      return;
    }
    const fixedSeed = params.has('wseed') || params.has('t');
    if (params.has('wseed')) wobbleSeed = Math.round(clamp(params.get('wseed'), 0, 9999));
    else if (params.has('t')) wobbleSeed = 3;
    const scale = String((mode === 'edge' ? 22 : 14) * intensity);
    const filterId = mode === 'edge' ? 'fxWobbleEdge' : 'fxWobbleFull';
    effects.wobbleWrap.setAttribute('filter', `url(#${filterId})`);
    effects.wobbleFullDisplacement.setAttribute('scale', scale);
    effects.wobbleEdgeDisplacement.setAttribute('scale', scale);
    const applySeed = () => {
      effects.wobbleFullNoise.setAttribute('seed', String(wobbleSeed));
      effects.wobbleEdgeNoise.setAttribute('seed', String(wobbleSeed));
    };
    applySeed();
    if (fixedSeed) return;
    const frame = (now) => {
      if (now - wobbleLastAt >= 100) {
        wobbleLastAt = now;
        wobbleSeed = (wobbleSeed + 1) % 10000;
        applySeed();
      }
      wobbleFrameId = requestAnimationFrame(frame);
    };
    wobbleFrameId = requestAnimationFrame(frame);
  };

  const stopHairPatternLoop = () => {
    cancelAnimationFrame(hairPatternFrameId);
    hairPatternFrameId = 0;
  };

  const stopTextPatternLoop = () => {
    cancelAnimationFrame(textPatternFrameId);
    textPatternFrameId = 0;
  };

  const setPatternText = (value = '') => {
    currentPatternText = formatPatternText(value);
    effects.textPatternLine1.textContent = currentPatternText;
    effects.textPatternLine2.textContent = currentPatternText;
    const width = Math.max(520, Array.from(currentPatternText).length * 52 + 120);
    effects.textPattern.setAttribute('width', String(width));
    effects.textPatternLine2.setAttribute('x', String(width / 2));
    const enabled = Boolean(config.textPattern) || params.has('textfx');
    effects.textPatternWrap.setAttribute('display', enabled ? 'inline' : 'none');
  };

  const updateTextPattern = () => {
    stopTextPatternLoop();
    const enabled = Boolean(config.textPattern) || params.has('textfx');
    effects.textPatternWrap.setAttribute('display', enabled ? 'inline' : 'none');
    if (!enabled) return;
    const fixed = params.has('t');
    const frame = (now) => {
      const offset = fixed ? 0 : -((now / 70) % 900);
      effects.textPattern.setAttribute('patternTransform', `translate(${offset} 0) rotate(-20)`);
      if (!fixed) textPatternFrameId = requestAnimationFrame(frame);
    };
    frame(params.has('t') ? state.fixedT * 1000 : performance.now());
  };

  const updateHairPattern = (pattern) => {
    stopHairPatternLoop();
    const fills = { stars: 'url(#fxHairStars)', stripes: 'url(#fxHairStripes)', hologram: 'url(#fxHairHologram)' };
    if (pattern === 'none') {
      effects.hairPatternOverlay.setAttribute('display', 'none');
      effects.hairPatternBaseNodes.forEach(({ wrapper }) => wrapper.setAttribute('display', 'none'));
      return;
    }
    const opacity = pattern === 'stars' ? '.85' : pattern === 'stripes' ? '.6' : '.55';
    effects.hairPatternOverlay.setAttribute('display', 'inline');
    effects.hairPatternOverlay.setAttribute('fill', fills[pattern]);
    effects.hairPatternOverlay.setAttribute('opacity', opacity);
    effects.hairPatternOverlayRect.setAttribute('fill', fills[pattern]);
    effects.hairPatternBaseNodes.forEach(({ rect, wrapper }) => {
      rect.setAttribute('fill', fills[pattern]);
      wrapper.setAttribute('display', 'inline');
      wrapper.setAttribute('opacity', opacity);
    });
    const fixed = params.has('t') || params.has('mx') || params.has('my');
    const frame = (now) => {
      if (now - hairPatternLastAt >= 120) {
        hairPatternLastAt = now;
        if (pattern === 'stripes') {
          const offset = ((now % 5200) / 5200) * -260;
          effects.hairStripes.setAttribute('patternTransform', `translate(${offset} 0)`);
        }
        if (pattern === 'hologram') {
          const angle = params.has('mx') || params.has('my')
            ? state.mouse.x * 28 + state.mouse.y * 12
            : (state.fixedT === null ? now / 24 : 0);
          effects.hairHologram.setAttribute('gradientTransform', `rotate(${angle} ${effects.W / 2} ${effects.H / 2})`);
        }
      }
      if (!fixed) hairPatternFrameId = requestAnimationFrame(frame);
    };
    frame(params.has('t') ? state.fixedT * 1000 : performance.now());
  };

  const playShine = () => {
    const runId = ++shineRunId;
    cancelAnimationFrame(shineFrameId);
    effects.shineWrap.setAttribute('display', 'inline');
    const fixedProgress = params.has('shine') ? clamp(params.get('shine'), 0, 1) : null;
    const apply = (progress) => {
      const offset = 710 + progress * 1280;
      effects.shineBand.setAttribute('transform', `translate(${offset} 0) rotate(-20 ${effects.W / 2} ${effects.H / 2})`);
    };
    if (fixedProgress !== null) {
      apply(fixedProgress);
      return;
    }
    let startedAt = null;
    const frame = (now) => {
      if (runId !== shineRunId) return;
      if (startedAt === null) startedAt = now;
      const progress = Math.min(Math.max((now - startedAt) / 600, 0), 1);
      apply(progress);
      if (progress < 1) shineFrameId = requestAnimationFrame(frame);
      else effects.shineWrap.setAttribute('display', 'none');
    };
    shineFrameId = requestAnimationFrame(frame);
  };

  const setBackdrop = (value) => {
    const backdrop = ['none', 'focusLines', 'halftone'].includes(value) ? value : 'none';
    effects.backdropGroup.setAttribute('display', backdrop === 'none' ? 'none' : 'inline');
    effects.backdropGroup.querySelectorAll('[data-backdrop]').forEach((node) => {
      node.setAttribute('display', node.getAttribute('data-backdrop') === backdrop ? 'inline' : 'none');
    });
  };

  const particleShape = (kind, x, y, size, color) => {
    if (kind === 'heart') return el('path', { d: `M${x} ${y + size * .25} C${x - size} ${y - size * .55} ${x - size * 1.2} ${y + size * .65} ${x} ${y + size * 1.2} C${x + size * 1.2} ${y + size * .65} ${x + size} ${y - size * .55} ${x} ${y + size * .25} Z`, fill: color });
    if (kind === 'star') {
      const points = Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 ? size * .42 : size;
        return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
      }).join(' ');
      return el('polygon', { points, fill: color });
    }
    if (kind === 'clap') return el('path', { d: `M${x - size * .95} ${y - size * .35} L${x - size * .2} ${y - size * .08} M${x + size * .95} ${y - size * .35} L${x + size * .2} ${y - size * .08} M${x - size * .65} ${y + size * .65} L${x - size * .12} ${y + size * .15} M${x + size * .65} ${y + size * .65} L${x + size * .12} ${y + size * .15}`, stroke: color, 'stroke-width': Math.max(4, size * .18), 'stroke-linecap': 'round', fill: 'none' });
    return el('ellipse', { cx: x, cy: y, rx: size * .55, ry: size, fill: color, transform: `rotate(-28 ${x} ${y})` });
  };

  const playParticles = (kind = 'heart') => {
    cancelAnimationFrame(particleFrameId);
    effects.particleGroup.replaceChildren();
    const particleKind = ['heart', 'star', 'petal', 'clap'].includes(kind) ? kind : 'heart';
    const particles = Array.from({ length: 28 }, (_, i) => {
      const seed = (i * 37 + 11) % 101 / 101;
      const angle = seed * Math.PI * 2;
      const distance = effects.W * (.16 + ((i * 17) % 53) / 100);
      const startX = effects.W / 2 + Math.cos(angle) * effects.W * .12;
      const startY = effects.H * .46 + Math.sin(angle) * effects.H * .13;
      const endX = effects.W / 2 + Math.cos(angle) * distance;
      const endY = effects.H * .44 + Math.sin(angle) * distance;
      const node = particleShape(particleKind, startX, startY, (18 + (i % 5) * 5) * (particleKind === 'heart' ? 1.6 : 1), i % 2 ? '#ff6b9d' : '#ffd166');
      effects.particleGroup.append(node);
      return { node, startX, startY, endX, endY, spin: (i % 2 ? 1 : -1) * (180 + i * 7), duration: 1200 + (i % 7) * 100, delay: (i % 6) * 35 };
    });
    let started = null;
    const fixedProgress = params.has('pt') ? clamp(params.get('pt'), 0, 1) : null;
    const frame = (now) => {
      if (started === null) started = now;
      const elapsed = now - started;
      let active = false;
      particles.forEach((particle) => {
        const progress = fixedProgress ?? Math.min(Math.max((elapsed - particle.delay) / particle.duration, 0), 1);
        if (fixedProgress === null && progress < 1) active = true;
        const eased = 1 - Math.pow(1 - progress, 2);
        const x = particle.startX + (particle.endX - particle.startX) * eased;
        const y = particle.startY + (particle.endY - particle.startY) * eased;
        particle.node.setAttribute('transform', `translate(${x - particle.startX} ${y - particle.startY}) rotate(${particle.spin * eased} ${particle.startX} ${particle.startY})`);
        particle.node.setAttribute('opacity', String(fixedProgress === null ? Math.min(progress * 5, 1) * Math.min((1 - progress) * 5, 1) : 1));
      });
      if (active) particleFrameId = requestAnimationFrame(frame);
      else if (fixedProgress === null) effects.particleGroup.replaceChildren();
    };
    particleFrameId = requestAnimationFrame(frame);
  };

  const setEffects = (next) => {
    config = { ...config, ...next, effectIntensity: clamp(next.effectIntensity ?? config.effectIntensity, .25, 2) };
    const visualParam = params.get('visual');
    const visualModes = ['normal', 'monochrome', 'lineArt', 'neon', 'poster', 'halftone', 'duotone'];
    const visualMode = visualModes.includes(visualParam || config.visualMode) ? (visualParam || config.visualMode) : 'normal';
    const outline = params.get('outline') === 'sticker' ? 'sticker' : config.outline;
    const rimLight = params.has('rim') ? params.get('rim') !== '0' : Boolean(config.rimLight);
    const aura = params.has('aura') ? params.get('aura') !== '0' : Boolean(config.aura);
    const dropShadow = params.has('shadow') ? params.get('shadow') !== '0' : Boolean(config.dropShadow);
    const expressionEmotion = config.emotionSync || params.has('emotion') ? emotion : 'neutral';
    effects.expression?.setEmotion(expressionEmotion);
    const requestedMood = params.get('mood') || (config.emotionSync ? EMOTION_MOODS[emotion] : config.colorMood);
    const mood = Object.prototype.hasOwnProperty.call(MOOD_MATRICES, requestedMood) ? requestedMood : 'neutral';
    const distortion = ['cyber', 'water'].includes(config.distortion) ? config.distortion : 'none';
    const pattern = ['aurora', 'scanlines', 'dots'].includes(config.pattern) ? config.pattern : 'none';
    const hairHueShift = params.has('hue') ? clamp(params.get('hue'), -180, 180) : clamp(config.hairHueShift, -180, 180);
    const backdrop = params.get('backdrop') || config.backdrop;
    const wobbleParam = params.get('wobble');
    const wobble = ['none', 'full', 'edge'].includes(wobbleParam || config.wobble) ? (wobbleParam || config.wobble) : 'none';
    const hairfxParam = params.get('hairfx');
    const hairfx = ['none', 'stars', 'stripes', 'hologram'].includes(hairfxParam || config.hairPattern) ? (hairfxParam || config.hairPattern) : 'none';

    svg.dataset.visualMode = visualMode;
    svg.dataset.glitch = config.glitch ? 'true' : 'false';
    svg.style.setProperty('--effect-intensity', String(config.effectIntensity));
    applyHairHue(svg, hairHueShift);
    setBackdrop(backdrop);
    if (params.has('particles') && !debugParticlesStarted) {
      debugParticlesStarted = true;
      playParticles(params.get('particles'));
    }
    updateHairPattern(hairfx);
    if (params.has('textfx') && !debugTextPatternStarted) {
      debugTextPatternStarted = true;
      setPatternText(params.get('ptext') || DEFAULT_PATTERN_TEXT);
    }
    updateTextPattern();
    if (params.has('shine') && !debugShineStarted) {
      debugShineStarted = true;
      playShine();
    }

    effects.styleWrap.removeAttribute('filter');
    if (visualMode === 'monochrome') effects.styleWrap.setAttribute('filter', 'url(#fxMonochrome)');
    if (visualMode === 'neon') effects.styleWrap.setAttribute('filter', 'url(#fxNeon)');
    if (visualMode === 'poster') effects.styleWrap.setAttribute('filter', 'url(#fxPoster)');
    if (visualMode === 'halftone') effects.styleWrap.setAttribute('filter', 'url(#fxHalftoneBase)');
    if (visualMode === 'duotone') {
      const table = hexToRgbTable(DUOTONE_PALETTES[mood] ?? DUOTONE_PALETTES.neutral);
      effects.duotoneFuncs.r.setAttribute('tableValues', table.map((rgb) => rgb[0]).join(' '));
      effects.duotoneFuncs.g.setAttribute('tableValues', table.map((rgb) => rgb[1]).join(' '));
      effects.duotoneFuncs.b.setAttribute('tableValues', table.map((rgb) => rgb[2]).join(' '));
      effects.styleWrap.setAttribute('filter', 'url(#fxDuotone)');
    }
    effects.halftoneOverlay.setAttribute('display', visualMode === 'halftone' ? 'inline' : 'none');

    effects.outlineWrap.removeAttribute('filter');
    if (outline === 'sticker') effects.outlineWrap.setAttribute('filter', 'url(#fxSticker)');

    effects.rimLightWrap.removeAttribute('filter');
    effects.rimLightWrap.style.filter = '';
    if (rimLight) effects.rimLightWrap.setAttribute('filter', 'url(#fxRimLight)');

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

    effects.auraUse.setAttribute('display', aura ? 'inline' : 'none');
    effects.dropShadow.setAttribute('display', dropShadow ? 'inline' : 'none');

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
    updateWobbleLoop(wobble, config.effectIntensity);
  };

  const setEmotion = (value) => {
    const previousEmotion = emotion;
    emotion = normalizeEmotion(value);
    svg.dataset.emotion = emotion;
    effects.expression?.setEmotion(emotion);
    if (config.autoGesture && previousEmotion !== 'happy' && emotion === 'happy') playShine();
    if (config.emotionParticles && emotion !== 'neutral') {
      if (emotion === 'happy') playParticles('heart');
      if (emotion === 'surprised') playParticles('star');
      if (emotion === 'angry') setBackdrop('focusLines');
    }
    setEffects(config);
  };

  const animate = (duration, update, complete) => {
    const runId = ++revealRunId;
    let startedAt = null;
    const frame = (now) => {
      if (runId !== revealRunId) return;
      if (startedAt === null) startedAt = now;
      const progress = Math.min(Math.max((now - startedAt) / duration, 0), 1);
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
    const reveal = params.get('reveal') || config.reveal;
    if (reveal === 'wipe') {
      effects.revealRect.setAttribute('y', String(effects.H));
      animate(duration, (eased) => effects.revealRect.setAttribute('y', String(effects.H * (1 - eased))));
      return;
    }
    if (reveal === 'iris') {
      effects.revealRect.setAttribute('display', 'none');
      effects.revealCircle.setAttribute('display', 'inline');
      const maxRadius = Math.hypot(effects.W, effects.H) * .58;
      animate(duration, (eased) => effects.revealCircle.setAttribute('r', String(maxRadius * eased)), resetReveal);
      return;
    }
    if (reveal === 'draw') {
      effects.drawOverlay.style.display = 'inline';
      effects.renderedEffects.style.opacity = '0';
      requestAnimationFrame(() => effects.drawOverlay.classList.add('is-running'));
      animate(1450, (_eased, progress) => {
        effects.renderedEffects.style.opacity = String(progress < .58 ? 0 : Math.min((progress - .58) / .42, 1));
        effects.drawOverlay.style.opacity = String(progress < .72 ? 1 : Math.max(1 - (progress - .72) / .28, 0));
      }, resetReveal);
      return;
    }
    if (reveal === 'dissolve') {
      effects.scene.setAttribute('filter', 'url(#fxDissolve)');
      const updateDissolve = (progress) => {
        effects.renderedEffects.style.opacity = progress <= 0 ? '0' : '1';
        const threshold = .5 + (.5 - progress) * .6;
        effects.dissolveRed.setAttribute('slope', '12');
        effects.dissolveRed.setAttribute('intercept', String(-threshold * 12));
      };
      if (params.has('rp')) {
        updateDissolve(clamp(params.get('rp'), 0, 1));
      } else {
        updateDissolve(0);
        animate(duration, updateDissolve, resetReveal);
      }
    }
  };

  return {
    setEffects,
    setEmotion,
    setPatternText,
    playParticles,
    playShine,
    setAudioLevel(value, isSpeaking) {
      audioLevel = clamp(value, 0, 1);
      speaking = Boolean(isSpeaking);
      updateAudioGlow();
    },
    replayReveal,
    destroy() {
      resetReveal();
      cancelAnimationFrame(particleFrameId);
      stopWobbleLoop();
      stopHairPatternLoop();
      stopTextPatternLoop();
      cancelAnimationFrame(shineFrameId);
      shineRunId += 1;
      effects.particleGroup.replaceChildren();
    },
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

function startAnimation(parts, paths, expressionController, gestureWrap, rimPoint, rimDirectionOffset, W, H) {
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
  let springAngle = 0;
  let springVelocity = 0;
  let previousHeadDeg = 0;
  let saccadeX = 0, saccadeY = 0, saccadeTargetX = 0, saccadeTargetY = 0, nextSaccadeAt = 2.5;
  let doubleBlinkPending = false;
  let lastRimMouseX = NaN, lastRimMouseY = NaN;

  const gestureNames = new Set(['nod', 'tilt', 'jump', 'laugh']);
  const playGesture = (name) => {
    const busy = state.gestureName && state.gestureProgress === null && state.gestureStart >= 0 && t - state.gestureStart < 0.7;
    if (gestureNames.has(name) && state.gestureProgress === null && !busy) {
      state.gestureName = name;
      state.gestureStart = t;
    }
  };
  state.playGesture = playGesture;

  const gesturePose = () => {
    if (!gestureNames.has(state.gestureName)) return { sceneY: 0, sceneScaleX: 1, sceneScaleY: 1, headY: 0, headRotate: 0, headScaleY: 1 };
    const progress = state.gestureProgress ?? (state.gestureStart < 0 ? -1 : Math.min((t - state.gestureStart) / 0.7, 1));
    if (progress < 0) return { sceneY: 0, sceneScaleX: 1, sceneScaleY: 1, headY: 0, headRotate: 0, headScaleY: 1 };
    const wave = Math.sin(Math.PI * progress);
    if (progress >= 1 && state.gestureProgress === null) state.gestureName = '';
    if (state.gestureName === 'nod') return { sceneY: 0, sceneScaleX: 1, sceneScaleY: 1, headY: 13 * Math.sin(progress * Math.PI * 2) * wave, headRotate: 0, headScaleY: .985 };
    if (state.gestureName === 'tilt') return { sceneY: 0, sceneScaleX: 1, sceneScaleY: 1, headY: 0, headRotate: -4.5 * wave, headScaleY: 1 };
    if (state.gestureName === 'jump') {
      if (progress < .2) {
        const phase = progress / .2;
        return { sceneY: 8 * phase, sceneScaleX: 1 + .01 * phase, sceneScaleY: 1 - .03 * phase, headY: 0, headRotate: 0, headScaleY: 1 };
      }
      if (progress < .75) {
        const phase = (progress - .2) / .55;
        return { sceneY: 8 - 36 * phase, sceneScaleX: 1 - .02 * phase, sceneScaleY: .97 + .07 * phase, headY: 0, headRotate: 0, headScaleY: 1 };
      }
      const phase = (progress - .75) / .25;
      return { sceneY: -28 + 28 * phase, sceneScaleX: .98 + .02 * phase, sceneScaleY: 1.04 - .07 * phase, headY: 0, headRotate: 0, headScaleY: 1 };
    }
    return { sceneY: Math.sin(progress * Math.PI * 8) * 4 * wave, sceneScaleX: 1, sceneScaleY: 1, headY: 0, headRotate: Math.sin(progress * Math.PI * 4) * 2 * wave, headScaleY: 1 };
  };

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
    const pose = gesturePose();
    if (state.fixedT === null && F.mouseFollow && Math.abs(state.mouse.x) < .05 && Math.abs(state.mouse.y) < .05) {
      if (t >= nextSaccadeAt) {
        saccadeTargetX = (Math.random() * 2 - 1) * 3;
        saccadeTargetY = (Math.random() * 2 - 1) * 2;
        nextSaccadeAt = t + 2 + Math.random() * 3;
      }
      const step = Math.min(dt / .08, 1);
      saccadeX += (saccadeTargetX - saccadeX) * step;
      saccadeY += (saccadeTargetY - saccadeY) * step;
    } else {
      saccadeX = 0; saccadeY = 0;
    }
    if (gestureWrap) setT([gestureWrap], `translate(0 ${pose.sceneY}) ${scaleAbout(W / 2, H, pose.sceneScaleX, pose.sceneScaleY)}`);
    if (rimPoint && (state.mouse.x !== lastRimMouseX || state.mouse.y !== lastRimMouseY)) {
      rimPoint.setAttribute('x', String(W * (.5 + state.mouse.x * .35)));
      rimPoint.setAttribute('y', String(H * (.34 + state.mouse.y * .24)));
      if (rimDirectionOffset) {
        rimDirectionOffset.setAttribute('dx', String(-12 - state.mouse.x * 8));
        rimDirectionOffset.setAttribute('dy', String(14 + state.mouse.y * 8));
      }
      lastRimMouseX = state.mouse.x;
      lastRimMouseY = state.mouse.y;
    }
    const safeDt = state.fixedT === null ? Math.max(dt, 1 / 120) : 0;
    const headVelocity = safeDt ? (headDeg - previousHeadDeg) / safeDt : 0;
    if (safeDt) {
      const targetSpring = -headVelocity * 0.12;
      springVelocity += (targetSpring - springAngle) * 18 * safeDt;
      springVelocity *= Math.exp(-7 * safeDt);
      springAngle += springVelocity * safeDt;
    } else {
      springAngle = 0;
      springVelocity = 0;
    }
    previousHeadDeg = headDeg;
    setT(parts.head, `translate(0 ${breath * 0.5 + pose.headY}) ${scaleAbout(CFG.pivot.x, CFG.pivot.y, 1, pose.headScaleY)} rotate(${headDeg + pose.headRotate} ${CFG.pivot.x} ${CFG.pivot.y})`);

    // Hair follows the head with a slight delayed counter-swing.
    const hairDeg = (F.hairSway ? Math.sin(t * 2 * Math.PI / M.hairPeriod) * M.hairDeg * A : 0) - headDeg * 0.35 + springAngle;
    const parallaxX = F.mouseFollow ? state.mouse.x * 1.5 : 0;
    const parallaxY = F.mouseFollow ? state.mouse.y * 1 : 0;
    setT(parts.hair, `translate(${parallaxX} ${parallaxY}) rotate(${hairDeg} ${CFG.hairPivot.x} ${CFG.hairPivot.y})`);
    setT(parts.face, `translate(${F.mouseFollow ? state.mouse.x * .6 : 0} ${F.mouseFollow ? state.mouse.y * .4 : 0})`);

    setT(parts.body, `translate(0 ${breath})`);

    // Blinking
    let blinkAmt = 0;
    if (state.forceBlink) blinkAmt = 1;
    else if (F.blink && state.fixedT === null) {
      if (state.blinkStart < 0 && t >= state.nextBlinkAt) state.blinkStart = t;
      if (state.blinkStart >= 0) {
        const p = (t - state.blinkStart) / M.blinkDur;
      if (p >= 1) {
        state.blinkStart = -1;
        if (!doubleBlinkPending && Math.random() < .2) {
          doubleBlinkPending = true;
          state.nextBlinkAt = t + .12;
        } else {
          doubleBlinkPending = false;
          state.nextBlinkAt = t + M.blinkMin + Math.random() * (M.blinkMax - M.blinkMin);
        }
      }
        else blinkAmt = tri(p);
      }
    }
    const eyeScale = 1 - blinkAmt * 0.92;
    const ex = (F.mouseFollow ? state.mouse.x * M.mouseEyePx * A : 0) + saccadeX;
    const ey = (F.mouseFollow ? state.mouse.y * M.mouseEyePx * 0.6 * A : 0) + saccadeY + (state.thinking ? -9 : 0);
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
    const mouthWidth = Math.min(Math.max(Number(state.audioMouthWidth) || 1, .75), 1.25);
    setT(parts.mouth, scaleAbout(mouthc.x, RM.y1 + 8, mouthWidth, Math.max(open, 0.0001)));
    const lipS = Math.max(1 - open, 0.0001);
    setT(parts.mouthLip, scaleAbout((RM.x1 + RM.x2) / 2, RM.y2 + 10, mouthWidth, lipS));
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
  const stopAnimation = parts ? startAnimation(parts, data.paths, effects?.expression, effects?.gestureWrap, effects?.rimPoint, effects?.rimDirectionOffset, data.W, data.H) : () => {};
  const effectController = createEffectController(svg, effects);
  effectController.setEmotion(state.emotion);
  if (params.has('reveal')) effectController.replayReveal();

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
    setVoiceLevel(value, isSpeaking, mouthWidth) {
      const wasSpeaking = state.isSpeaking;
      state.audioMouthOpen = Math.min(Math.max(Number(value) || 0, 0), 1);
      if (!params.has('mouthw') && mouthWidth !== undefined) state.audioMouthWidth = Number(mouthWidth) || 1;
      state.isSpeaking = Boolean(isSpeaking);
      if (!wasSpeaking && state.isSpeaking && state.autoGesture) state.playGesture('nod');
      if (!state.isSpeaking) {
        state.audioMouthOpen = 0;
        state.audioMouthWidth = params.has('mouthw') ? state.audioMouthWidth : 1;
      }
      effectController.setAudioLevel(state.audioMouthOpen, state.isSpeaking);
    },
    setEmotion(value) {
      const debugEmotion = new URLSearchParams(location.search).get('emotion');
      const previousEmotion = state.emotion;
      state.emotion = debugEmotion ? normalizeEmotion(debugEmotion) : normalizeEmotion(value);
      if (state.autoGesture && previousEmotion !== state.emotion) {
        const gesture = { happy: 'laugh', surprised: 'jump', sad: 'tilt', angry: 'tilt' }[state.emotion];
        if (gesture) state.playGesture(gesture);
      }
      effectController.setEmotion(state.emotion);
    },
    playGesture(name) {
      state.playGesture(String(name));
    },
    playParticles(kind) {
      effectController.playParticles(String(kind));
    },
    playShine() {
      effectController.playShine();
    },
    setPatternText(text) {
      effectController.setPatternText(text);
    },
    setThinking(value) {
      state.setThinking(value);
    },
    setOptions(options) {
      if (typeof options.amp === 'number') state.amp = options.amp;
      if (typeof options.speed === 'number') state.speed = options.speed;
      for (const key of ['breath', 'headSway', 'hairSway', 'blink', 'mouseFollow']) {
        if (typeof options[key] === 'boolean') state.flags[key] = options[key];
      }
      if (typeof options.autoGesture === 'boolean') state.autoGesture = options.autoGesture;
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
