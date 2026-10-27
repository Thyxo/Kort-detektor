// Ende-til-ende-test i Chromium med iPhone-skærm og touch.
// Kør: node tests/e2e.mjs   (starter selv en lokal server)
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const g = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${g}/`)('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8765;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const shots = process.env.SHOTS || '';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);

async function touch(x, y, holdMs = 40) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await wait(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(60);
}
async function center(sel) {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}
const st = () => page.evaluate(() => window.__cardDetector.state);
const stats = () => page.evaluate(() => ({ ...window.__cardDetector.stats }));
const litCount = () => page.evaluate(() => document.querySelectorAll('.arc.lit').length);
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

await page.goto(`http://127.0.0.1:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(300);

const N = await page.locator('.arc').count();
ok(N === 16, `${N} buer tegnet`);
ok(await st() === 'off', 'starter SLUKKET');
const mbox = await page.locator('#mainBtn').boundingBox();
ok(Math.abs(mbox.x + mbox.width / 2 - 393 / 2) < 1, 'hovedknap i midten');
const topArc = await page.locator('.arc').nth(N - 1).boundingBox();
const lowArc = await page.locator('.arc').nth(0).boundingBox();
ok(topArc.y < 120 && topArc.width > 300, `øverste bue højt oppe og bred (y=${topArc.y.toFixed(0)}, b=${topArc.width.toFixed(0)})`);
ok(lowArc.y + lowArc.height < mbox.y - 20 && lowArc.y > mbox.y - 130 && lowArc.width < topArc.width * 0.3, `nederste bue kort og lige over knappen (${(mbox.y - lowArc.y - lowArc.height).toFixed(0)} px)`);
await shot('1-off');

// hemmelig knap alene udløser tricket direkte fra SLUKKET
await touch(...await center('#secretBtn'));
await wait(150);
ok(await st() === 'rising', 'hemmelig knap alene (fra SLUKKET) → buerne stiger');
await wait(1500);
ok(await st() === 'found' && await litCount() === N, 'hemmelig knap alene → FUNDET');
await touch(...await center('#mainBtn'));
await wait(500);
ok(await st() === 'off' && await litCount() === 0, 'hovedknap nulstiller');

// SLUKKET → AKTIV
await touch(...await center('#mainBtn'));
ok(await st() === 'active', 'tryk på hovedknap → AKTIV');
await wait(400);
await shot('2-active');
ok(await litCount() === 0, 'buer stadig slukkede i AKTIV');

// AKTIV → SLUKKET → AKTIV
await touch(...await center('#mainBtn'));
ok(await st() === 'off', 'tryk igen → SLUKKET');
await touch(...await center('#mainBtn'));
ok(await st() === 'active', 'og AKTIV igen');
ok(await page.evaluate(() => window.__cardDetector.audioState) === 'running', 'lyd initialiseret efter tryk');

// AKTIV → FUNDET
const before = await stats();
await touch(...await center('#secretBtn'));
ok(await st() === 'rising', 'hemmelig knap → buerne stiger');
await wait(500);
const mid = await litCount();
ok(mid > 0 && mid < N, `buerne tænder én for én (${mid}/${N} efter 0,5 s)`);
await shot('3-rising');
await wait(1100);
ok(await st() === 'found' && await litCount() === N, `FUNDET: alle ${N} buer tændt efter ca. 1,2 s`);
let after = await stats();
ok(after.beeps - before.beeps === N && after.found - before.found === 1, `lyd: ${N} bip + fundet-tone (${after.beeps - before.beeps} bip)`);
await wait(800);
await shot('4-found');
await wait(1000);
ok(await st() === 'found' && await litCount() === N, 'FUNDET holdes');

// nulstil
await touch(...await center('#mainBtn'));
await wait(500);
ok(await st() === 'off' && await litCount() === 0, 'tryk på hovedknap → nulstillet (SLUKKET)');

// hemmelig menu: 5 hurtige tryk
const taps = async (n) => { for (let i = 0; i < n; i++) await touch(380, 20, 30); };
await taps(4);
await wait(2700);
ok(await page.locator('#menu').isHidden(), '4 tryk åbner ikke menuen');
await taps(5);
await wait(450);
ok(await page.locator('#menu').isVisible(), '5 hurtige tryk øverst til højre åbner hemmelig menu');
await touch(380, 20, 30);
await wait(300);
ok(await page.locator('#menu').isVisible(), 'et ekstra hurtigt tryk lukker ikke menuen');
await shot('5-menu');

// slå lyd fra, hastighed hurtig, placering over, størrelse stor
await page.locator('input[data-key="sound"]').click();
await page.locator('.seg[data-key="speed"] button[data-v="fast"]').click();
await page.locator('.seg[data-key="secretPos"] button[data-v="above"]').click();
await page.locator('.seg[data-key="secretSize"] button[data-v="large"]').click();
await shot('6-menu-changed');
// luk ved tryk udenfor
await wait(500);
await touch(200, 30);
await wait(500);
ok(await page.locator('#menu').isHidden(), 'tryk udenfor lukker menuen');

// genstart → indstillinger gemt
await page.reload();
await wait(300);
const s = await page.evaluate(() => window.__cardDetector.settings);
ok(s.sound === false && s.speed === 'fast' && s.secretPos === 'above' && s.secretSize === 'large', 'indstillinger gemt efter genstart');
const sb = await page.locator('#secretBtn').boundingBox();
const mb = await page.locator('#mainBtn').boundingBox();
ok(sb.y + sb.height <= mb.y && sb.width === 108, 'hemmelig knap ligger nu over hovedknappen (stor)');

// lyd fra: ingen bip, hurtig opstigning
await touch(...await center('#mainBtn'));
const b2 = await stats();
await touch(...await center('#secretBtn'));
await wait(1100);
const a2 = await stats();
ok(await st() === 'found', 'hurtig opstigning færdig inden 1,1 s');
ok(a2.beeps === b2.beeps && a2.found === b2.found, 'lyd slået fra → ingen lyd');

// hemmelig knap slået fra
await touch(...await center('#mainBtn'));
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('card-detector-settings-v1')); s.secretEnabled = false; localStorage.setItem('card-detector-settings-v1', JSON.stringify(s)); });
await page.reload();
await wait(300);
await touch(...await center('#mainBtn'));
await page.mouse.click(mb.x + mb.width + 50, mb.y + mb.height / 2);
await wait(400);
ok(await litCount() === 0, 'hemmelig knap slået fra → intet sker');

// lukkeknap
await taps(5);
await wait(1100);
await page.locator('#menuDone').click();
await wait(500);
ok(await page.locator('#menu').isHidden(), 'Færdig-knap lukker menuen');

// service worker / offline
const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(swOk, 'service worker aktiv');
await page.reload(); await wait(400);
await context.setOffline(true);
await page.reload(); await wait(400);
ok(await page.locator('.arc').count() === N, 'appen åbner offline');
await context.setOffline(false);

// iOS-fejlen: hjemmeskærm-app, hvor vinduet er statuslinjens højde (59) for lavt
const ios = await browser.newContext({
  viewport: { width: 393, height: 793 }, screen: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
await ios.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
const p2 = await ios.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto(`http://127.0.0.1:${PORT}/`);
await wait(400);
const dims = await p2.evaluate(() => {
  const q = (s) => document.querySelector(s).getBoundingClientRect();
  return { html: document.documentElement.clientHeight, body: q('body').height, app: q('#app').height, menu: (() => { const m = document.getElementById('menu'); m.hidden = false; const h = m.getBoundingClientRect().height; m.hidden = true; return h; })(), btn: q('#mainBtn').bottom };
});
ok(dims.app === 852 && dims.body === 852 && dims.menu === 852, `iOS-fejl: app/body/menu fylder hele skærmen (${dims.app}/${dims.body}/${dims.menu})`);
ok(dims.btn > 793, `iOS-fejl: knappen sidder i den rigtige bund (${dims.btn})`);
await ios.close();

ok(errors.length === 0, `ingen JS-fejl ${errors.join(' | ')}`);
await browser.close();
server.kill();
console.log(fails ? `\n${fails} FEJL` : '\nAlle tests bestået');
process.exit(fails ? 1 : 0);
