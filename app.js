/* Card Detector – en "detektor", der finder det valgte kort.
 * Den registrerer intet. Buerne tænder kun, når du trykker på den usynlige hemmelige knap.
 *
 * Tilstande: off (slukket) → active (tændt/rød) → rising (buerne stiger) → found (fundet)
 */
(() => {
'use strict';

const VERSION = '1.4.0';

// ============ ÅBNING AF HEMMELIG MENU – ret her ============
const MENU_OPEN = {
  method: 'taps',        // 'taps' (flere hurtige tryk) eller 'longpress' (hold fingeren)
  holdMs: 1500,          // longpress: hvor længe der skal holdes
  taps: 5,               // taps: antal tryk ...
  tapWindowMs: 2500,     // ... inden for så mange ms
  corner: 'top-right',   // 'top-right' | 'top-left' | 'bottom-right'
  size: 90,              // zonens størrelse i px (plus safe-area)
};

// ============ UDSEENDE OG TIMING ============
const ARC_COUNT = 16;
const ARC_LAYOUT = {
  bottomGap: 52,       // afstand fra knappens kant til den nederste bue (px)
  strokeRatio: 0.38,   // stregtykkelse i forhold til afstanden mellem buerne
  maxStroke: 14,       // px
  sideMargin: 24,      // afstand fra skærmkant til øverste bues ender
  maxAngle: 38,        // største halve vinkel (grader)
};
const SPEEDS = { fast: 800, medium: 1200, slow: 2000 };      // ms fra første til sidste bue
const SECRET_SIZES = { small: 64, medium: 84, large: 108 };   // px
const VOLUMES = { low: 0.22, mid: 0.5, high: 0.9 };
// rød → orange → gul → grøn (nederst → øverst)
const COLOR_STOPS = [
  [0.00, [255, 59, 48]],
  [0.30, [255, 149, 0]],
  [0.58, [255, 214, 10]],
  [1.00, [48, 209, 88]],
];

// ============ INDSTILLINGER (localStorage) ============
const SETTINGS_KEY = 'card-detector-settings-v1';
const DEFAULTS = {
  sound: true,
  volume: 'mid',          // low | mid | high
  ignoreSilent: true,     // spil lyd, selvom iPhonen står på lydløs
  haptic: true,
  secretEnabled: true,
  secretPos: 'right',     // right | left | above
  secretSize: 'medium',   // small | medium | large
  showZone: false,        // vis den hemmelige knap (til øvelse)
  speed: 'medium',        // fast | medium | slow
  afterFound: 'off',      // off = tryk slukker | active = tryk gør klar igen
};

function loadSettings() {
  const out = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULTS)) {
        if (typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
      }
    }
  } catch { /* privat tilstand e.l. */ }
  return out;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

let settings = loadSettings();

// ============ DOM ============
const $ = (id) => document.getElementById(id);
const app = $('app');
const svg = $('arcs');
const mainBtn = $('mainBtn');
const secretBtn = $('secretBtn');
const menuZone = $('menuZone');
const menu = $('menu');
const sheet = $('sheet');
const scrim = $('scrim');

// Til test/fejlsøgning
const stats = { beeps: 0, found: 0 };

// ============ BUER ============
const SVG_NS = 'http://www.w3.org/2000/svg';
const arcs = [];
const glows = [];

function mix(t) {
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [p1, c1] = COLOR_STOPS[i];
    const [p0, c0] = COLOR_STOPS[i - 1];
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  const c = COLOR_STOPS[COLOR_STOPS.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Buerne er "bølger" ud fra den runde knap (fælles centrum i knappens midte):
// den nederste lige over knappen, den øverste lige under statuslinjen.
let arcLayer = null;
let glowLayer = null;

function safeTop() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const v = probe.offsetHeight;
  probe.remove();
  return v;
}

function buildArcs() {
  if (!arcLayer) {
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = '<filter id="blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>';
    glowLayer = document.createElementNS(SVG_NS, 'g');
    glowLayer.setAttribute('filter', 'url(#blur)');
    arcLayer = document.createElementNS(SVG_NS, 'g');
    svg.append(defs, glowLayer, arcLayer);
    for (let i = 0; i < ARC_COUNT; i++) {
      const color = mix(i / (ARC_COUNT - 1));
      const g = document.createElementNS(SVG_NS, 'path');
      g.setAttribute('class', 'glow');
      g.style.stroke = color;
      glowLayer.appendChild(g);
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('class', 'arc');
      p.dataset.color = color;
      arcLayer.appendChild(p);
      arcs.push(p);
      glows.push(g);
    }
  }
  layoutArcs();
}

function layoutArcs() {
  const W = app.clientWidth;
  const H = app.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const b = mainBtn.getBoundingClientRect();
  const a = app.getBoundingClientRect();
  const cx = W / 2;
  const cy = b.top - a.top + b.height / 2;          // knappens midte
  const topY = Math.max(safeTop(), 20) + 46;         // øverste bue
  const rMax = Math.max(cy - topY, 120);
  const rMin = Math.min(b.height / 2 + ARC_LAYOUT.bottomGap, rMax * 0.5);
  const pitch = (rMax - rMin) / (ARC_COUNT - 1);
  const sw = Math.max(6, Math.min(ARC_LAYOUT.maxStroke, pitch * ARC_LAYOUT.strokeRatio));
  const halfW = W / 2 - ARC_LAYOUT.sideMargin - sw / 2;
  const span = Math.min(Math.asin(Math.min(1, halfW / rMax)), ARC_LAYOUT.maxAngle * Math.PI / 180);
  for (let i = 0; i < ARC_COUNT; i++) {
    const r = rMin + pitch * i;
    const x1 = cx - r * Math.sin(span);
    const x2 = cx + r * Math.sin(span);
    const y = cy - r * Math.cos(span);
    const d = `M${x1.toFixed(1)} ${y.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y.toFixed(1)}`;
    arcs[i].setAttribute('d', d);
    arcs[i].setAttribute('stroke-width', sw.toFixed(1));
    glows[i].setAttribute('d', d);
    glows[i].setAttribute('stroke-width', (sw + 6).toFixed(1));
  }
}

function lightArc(i) {
  arcs[i].classList.add('lit');
  arcs[i].style.stroke = arcs[i].dataset.color;
  glows[i].classList.add('lit');
}
function clearArcs(animated) {
  for (let i = ARC_COUNT - 1; i >= 0; i--) {
    const off = () => {
      arcs[i].classList.remove('lit');
      arcs[i].style.stroke = '';
      glows[i].classList.remove('lit');
    };
    if (animated) setTimeout(off, (ARC_COUNT - 1 - i) * 22);
    else off();
  }
  app.classList.remove('flash');
}

// ============ LYD (Web Audio, ingen filer) ============
let ctx = null;
let master = null;

function applyAudioSession() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = settings.sound && settings.ignoreSilent ? 'playback' : 'ambient';
    }
  } catch { /* ikke understøttet */ }
}

// Kaldes fra et brugertryk (iOS kræver det, før lyd må spille)
function ensureAudio() {
  if (!settings.sound) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    applyAudioSession();
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    // stille lyd "låser" lyden op på ældre iOS
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

function canPlay() {
  return settings.sound && ctx && ctx.state === 'running';
}

function tone(freq, start, dur, type, peak, filterMul = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = o;
  if (filterMul) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq * filterMul;
    lp.Q.value = 2;
    node = o.connect(lp);
  }
  node.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

// Kort bip – tonehøjden stiger for hver bue (som en metaldetektor)
function beep(i) {
  if (!canPlay()) return;
  master.gain.value = VOLUMES[settings.volume] || VOLUMES.mid;
  const t = ctx.currentTime + 0.005;
  const f = 520 * Math.pow(2, (i * (20 / (ARC_COUNT - 1))) / 12); // knap 2 oktaver i alt
  tone(f, t, 0.075, 'square', 0.32, 3.2);
  tone(f * 2, t, 0.05, 'sine', 0.08);
  stats.beeps++;
}

// Længere "fundet"-tone
function foundTone() {
  if (!canPlay()) return;
  master.gain.value = VOLUMES[settings.volume] || VOLUMES.mid;
  const t = ctx.currentTime + 0.01;
  tone(1568, t, 0.09, 'square', 0.22, 3);
  tone(2093, t + 0.09, 0.75, 'triangle', 0.5);
  tone(2093 * 1.5, t + 0.09, 0.5, 'sine', 0.12);
  tone(1046.5, t + 0.09, 0.8, 'sine', 0.25);
  stats.found++;
}

// ============ HAPTIK ============
// iOS: et skjult "switch"-felt giver et lille tryk i Safari 18+. Android: vibrate().
function haptic() {
  if (!settings.haptic) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(12); return; }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch { /* ignore */ }
}

// ============ SKÆRMLÅS (skærmen må ikke slukke) ============
let wakeLock = null;
let wantLock = false;
async function lockScreen() {
  wantLock = true;
  if (wakeLock || document.hidden || !('wakeLock' in navigator)) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!wantLock) { lock.release().catch(() => {}); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* ikke tilladt lige nu */ }
}
function unlockScreen() {
  wantLock = false;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// ============ TILSTANDE ============
let state = 'off';
let rise = null;

function setState(s) {
  state = s;
  app.dataset.state = s;
  mainBtn.setAttribute('aria-label', s === 'off' ? 'Start' : 'Stop');
  if (s === 'off') unlockScreen();
  else lockScreen();
}

function startRise() {
  const total = SPEEDS[settings.speed] || SPEEDS.medium;
  const times = [];
  for (let i = 0; i < ARC_COUNT; i++) {
    const k = i / (ARC_COUNT - 1);
    // langsom start, hurtigere mod toppen – med en lille naturlig uro
    let t = 50 + total * Math.pow(k, 1.3);
    if (i > 0 && i < ARC_COUNT - 1) t += (Math.random() - 0.5) * (total / ARC_COUNT) * 0.35;
    times.push(Math.max(t, (times[i - 1] || 0) + 25));
  }
  rise = { start: performance.now(), times, lit: 0, raf: 0 };
  setState('rising');
  rise.raf = requestAnimationFrame(tick);
}

function tick(now) {
  if (!rise) return;
  const elapsed = now - rise.start;
  while (rise.lit < ARC_COUNT && elapsed >= rise.times[rise.lit]) {
    lightArc(rise.lit);
    beep(rise.lit);
    rise.lit++;
  }
  if (rise.lit >= ARC_COUNT && elapsed >= rise.times[ARC_COUNT - 1] + 130) {
    rise = null;
    found(true);
    return;
  }
  rise.raf = requestAnimationFrame(tick);
}

function found(withSound) {
  for (let i = 0; i < ARC_COUNT; i++) lightArc(i);
  setState('found');
  app.classList.remove('flash');
  void app.offsetWidth;
  app.classList.add('flash');
  if (withSound) foundTone();
  if (navigator.vibrate && settings.haptic) navigator.vibrate([20, 40, 30]);
}

function cancelRise() {
  if (rise) cancelAnimationFrame(rise.raf);
  rise = null;
}

function pressMain() {
  switch (state) {
    case 'off':
      setState('active');
      break;
    case 'active':
      setState('off');
      break;
    case 'rising':
      cancelRise();
      clearArcs(true);
      setState('off');
      break;
    case 'found':
      clearArcs(true);
      setState(settings.afterFound === 'active' ? 'active' : 'off');
      break;
  }
}

// Den hemmelige knap udløser tricket direkte – også når detektoren er slukket
// (knappen bliver rød, og buerne stiger med det samme).
function canSecret() {
  return settings.secretEnabled && (state === 'off' || state === 'active');
}
function pressSecret() {
  if (!canSecret()) return false;
  startRise();
  return true;
}

// ============ TRYK (reagerer ved berøring – som en rigtig app) ============
mainBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  mainBtn.classList.add('down');
  haptic();
  pressMain();
});
const mainUp = () => {
  mainBtn.classList.remove('down');
  ensureAudio(); // iOS: lyd må først startes ved slip af fingeren
};
mainBtn.addEventListener('pointerup', mainUp);
mainBtn.addEventListener('pointercancel', () => mainBtn.classList.remove('down'));
mainBtn.addEventListener('pointerleave', () => mainBtn.classList.remove('down'));

// iOS må først starte lyd, når fingeren slippes. Er lyden ikke klar endnu (første tryk
// efter opstart), startes tricket ved slip i stedet, så det første bip ikke forsvinder.
let secretPending = false;
const audioReady = () => !settings.sound || (ctx && ctx.state === 'running');
secretBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!canSecret()) return;
  haptic();
  if (audioReady()) pressSecret();
  else secretPending = true;
});
secretBtn.addEventListener('pointerup', () => {
  ensureAudio();
  if (!secretPending) return;
  secretPending = false;
  const go = () => { if (canSecret()) pressSecret(); };
  if (ctx && ctx.state !== 'running') {
    Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]).then(go, go);
  } else go();
});
secretBtn.addEventListener('pointercancel', () => { secretPending = false; });

// Alle slip af fingeren: gør lyden klar (første tryk) eller genoptag den efter pause
document.addEventListener('touchend', () => {
  if (settings.sound) ensureAudio();
  if (wantLock && !wakeLock) lockScreen();
}, { passive: true });

// ============ PLACERING AF HEMMELIG KNAP ============
function placeSecret() {
  const r = mainBtn.getBoundingClientRect();
  const s = SECRET_SIZES[settings.secretSize] || SECRET_SIZES.medium;
  const W = app.clientWidth;
  const H = app.clientHeight;
  const gap = 6;
  const cyBtn = r.top + r.height / 2;
  let x; let y; let w = s; let h = s;
  if (settings.secretPos === 'above') {
    x = r.left + r.width / 2 - s / 2;
    y = r.top - gap - s;
  } else if (settings.secretPos === 'left') {
    x = r.left - gap - s;
    y = cyBtn - s / 2;
  } else {
    x = r.right + gap;
    y = cyBtn - s / 2;
  }
  x = Math.max(0, Math.min(x, W - w));
  y = Math.max(0, Math.min(y, H - h));
  Object.assign(secretBtn.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  secretBtn.hidden = !settings.secretEnabled;
  secretBtn.classList.toggle('show', settings.showZone);
}

function placeMenuZone() {
  const s = MENU_OPEN.size;
  const z = menuZone.style;
  z.top = z.bottom = z.left = z.right = '';
  const [v, hz] = MENU_OPEN.corner.split('-');
  z[v] = '0';
  z[hz] = '0';
  z.width = `calc(${s}px + env(safe-area-inset-${hz}, 0px))`;
  z.height = `calc(${s}px + env(safe-area-inset-${v}, 0px))`;
}

// ============ HEMMELIG MENU: åbning ============
let hold = null;
let taps = [];
menuZone.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!menu.hidden) return;
  if (MENU_OPEN.method === 'taps') {
    const now = performance.now();
    taps = taps.filter((t) => now - t < MENU_OPEN.tapWindowMs);
    taps.push(now);
    if (taps.length >= MENU_OPEN.taps) { taps = []; openMenu(); }
    return;
  }
  hold = { x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => { hold = null; openMenu(); }, MENU_OPEN.holdMs) };
});
menuZone.addEventListener('pointermove', (e) => {
  if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 24) cancelHold();
});
function cancelHold() {
  if (hold) clearTimeout(hold.timer);
  hold = null;
}
menuZone.addEventListener('pointerup', cancelHold);
menuZone.addEventListener('pointercancel', cancelHold);

// ============ HEMMELIG MENU: vis/skjul ============
let menuOpenedAt = 0;
let closeTimer = 0;
function openMenu() {
  clearTimeout(closeTimer);
  syncMenu();
  syncDiag();
  menu.hidden = false;
  sheet.style.transform = '';
  void sheet.offsetHeight;
  menu.classList.add('open');
  menuOpenedAt = performance.now();
  $('sheetScroll').scrollTop = 0;
  haptic();
}
function closeMenu(force) {
  if (menu.hidden) return;
  if (!force && performance.now() - menuOpenedAt < 1000) return;
  menu.classList.remove('open');
  sheet.style.transform = '';
  sheet.classList.remove('dragging');
  scrim.style.opacity = '';
  closeTimer = setTimeout(() => { menu.hidden = true; }, 380);
  resetArm = false;
  $('resetSettings').textContent = 'Nulstil indstillinger';
}

// Tryk udenfor (kun et nyt tryk – ikke slip fra det lange tryk, der åbnede menuen)
let scrimDown = false;
scrim.addEventListener('pointerdown', () => { scrimDown = true; });
scrim.addEventListener('pointerup', () => { if (scrimDown) closeMenu(); scrimDown = false; });
$('menuDone').addEventListener('click', () => closeMenu());

// Træk arket ned for at lukke
let drag = null;
$('sheetHead').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  drag = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
  sheet.classList.add('dragging');
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
$('sheetHead').addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.transform = `translate(-50%, ${drag.dy}px)`;
  scrim.style.opacity = String(Math.max(0, 1 - drag.dy / 400));
});
const endDrag = () => {
  if (!drag) return;
  const v = drag.dy / Math.max(1, performance.now() - drag.t);
  const shouldClose = drag.dy > 120 || (v > 0.6 && drag.dy > 30);
  drag = null;
  sheet.classList.remove('dragging');
  if (shouldClose) closeMenu(true);
  else { sheet.style.transform = ''; scrim.style.opacity = ''; }
};
$('sheetHead').addEventListener('pointerup', endDrag);
$('sheetHead').addEventListener('pointercancel', endDrag);

// ============ HEMMELIG MENU: indstillinger ============
function syncMenu() {
  menu.querySelectorAll('input.switch[data-key]').forEach((el) => { el.checked = !!settings[el.dataset.key]; });
  menu.querySelectorAll('.seg[data-key]').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings[seg.dataset.key]));
  });
  menu.querySelectorAll('[data-dep]').forEach((row) => row.classList.toggle('off', !settings[row.dataset.dep]));
  const notes = {
    right: 'Usynlig zone til højre for den runde knap.',
    left: 'Usynlig zone til venstre for den runde knap.',
    above: 'Usynlig zone lige over den runde knap.',
  };
  $('zoneNote').textContent = settings.secretEnabled
    ? `${notes[settings.secretPos] || notes.right} Et tryk her starter tricket med det samme.`
    : 'Den hemmelige knap er slået fra – buerne kan ikke tænde.';
  $('version').textContent = `Card Detector ${VERSION}`;
}

function applySettings() {
  saveSettings();
  placeSecret();
  applyAudioSession();
  syncMenu();
}

menu.querySelectorAll('input.switch[data-key]').forEach((el) => {
  el.addEventListener('change', () => {
    settings[el.dataset.key] = el.checked;
    if (el.dataset.key === 'sound' && el.checked) ensureAudio();
    applySettings();
  });
});
menu.querySelectorAll('.seg[data-key]').forEach((seg) => {
  seg.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      settings[seg.dataset.key] = b.dataset.v;
      applySettings();
      b.blur();
    });
  });
});

$('testSound').addEventListener('click', () => {
  ensureAudio();
  const run = () => {
    if (!canPlay()) return;
    [0, 3, 6, 9].forEach((n, k) => setTimeout(() => beep(n), k * 110));
    setTimeout(foundTone, 480);
  };
  if (ctx && ctx.state !== 'running') ctx.resume().then(run).catch(() => {});
  else run();
});

$('testRun').addEventListener('click', () => {
  ensureAudio();
  closeMenu(true);
  cancelRise();
  clearArcs(false);
  setState('active');
  setTimeout(() => { if (state === 'active') startRise(); }, 650);
});

let resetArm = false;
let resetTimer = 0;
$('resetSettings').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (!resetArm) {
    resetArm = true;
    btn.textContent = 'Tryk igen for at nulstille';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { resetArm = false; btn.textContent = 'Nulstil indstillinger'; }, 3000);
    return;
  }
  resetArm = false;
  btn.textContent = 'Nulstil indstillinger';
  settings = { ...DEFAULTS };
  applySettings();
  haptic();
});

// ============ iOS-FINESSER: føles som en app, ikke en hjemmeside ============
// ingen zoom, ingen dobbelttryk-zoom, ingen markering/lang-tryk-menu, ingen scroll/bounce
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 || !e.target.closest('.sheet-scroll')) e.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest('.sheet')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// ---------- højde: iOS-fejl i hjemmeskærm-apps ----------
// På hjemmeskærmen kan iOS gøre siden statuslinjens højde (ca. 59 pt) for lav, så der
// kommer en sort stribe i bunden. Løsning fra Stopwatchplus: html, body, appen og
// menuen får skærmens fulde højde i px. Her gøres det altid på hjemmeskærmen (ikke kun,
// når innerHeight er for lav – iOS melder ikke altid fejlen).
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let heightFixed = false;
function fixHeight() {
  const portrait = innerHeight > innerWidth;
  const was = heightFixed;
  heightFixed = isStandalone() && portrait && screen.height >= innerHeight;
  // body er position:fixed med overflow:hidden og klipper ellers bunden væk
  for (const el of [document.body, app, menu]) {
    el.style.height = heightFixed ? `${screen.height}px` : '';
    el.style.bottom = heightFixed ? 'auto' : '';
  }
  document.documentElement.style.height = heightFixed ? `${screen.height}px` : '';
  return heightFixed !== was;
}
function onResize() {
  fixHeight();
  layoutArcs();
  placeSecret();
  syncDiag();
}
// Diagnose nederst i den hemmelige menu (send et skærmbillede, hvis noget ser forkert ud)
function syncDiag() {
  const el = $('diag');
  if (!el) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safe = `${parseFloat(cs.paddingTop) || 0}/${parseFloat(cs.paddingBottom) || 0}`;
  probe.remove();
  el.textContent = `skærm ${screen.width}×${screen.height} · vindue ${innerWidth}×${innerHeight} · app ${app.clientHeight} · safe ${safe} · ${isStandalone() ? 'hjemmeskærm' : 'browser'}${heightFixed ? ' · højde rettet' : ''}`;
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
window.addEventListener('pageshow', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
// iOS kan ændre højden lige efter opstart uden at sige det – tjek et par gange
for (const ms of [100, 400, 1000, 2500]) setTimeout(onResize, ms);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // appen blev lagt væk midt i opstigningen → gør den færdig uden lyd
    if (rise) { cancelRise(); found(false); }
  } else {
    onResize();
    if (wantLock) lockScreen();
    if (ctx && ctx.state !== 'running' && settings.sound) ctx.resume().catch(() => {});
  }
});

// ============ START ============
placeMenuZone();
fixHeight();
buildArcs();
placeSecret();
syncMenu();
setState('off');

window.__cardDetector = {
  stats,
  get state() { return state; },
  get settings() { return { ...settings }; },
  get audioState() { return ctx ? ctx.state : 'none'; },
};

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
