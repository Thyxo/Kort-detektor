// Genererer app-ikoner og sorte iOS-opstartsbilleder (PNG) med Playwright/Chromium.
// Kør: node tools/make-icons.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${globalRoot}/`)('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Hvid ring på sort (samme ring som hovedknappen i appen)
function svg({ rounded, ringScale }) {
  const r = 150 * ringScale;
  const w = 30 * ringScale;
  const bg = rounded ? '<rect width="512" height="512" rx="112" fill="#000"/>' : '<rect width="512" height="512" fill="#000"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}
    <circle cx="256" cy="256" r="${r}" fill="none" stroke="#fff" stroke-width="${w}"/></svg>`;
}

const icons = [
  { file: 'icon-192.png', size: 192, rounded: false, ringScale: 1 },
  { file: 'icon-512.png', size: 512, rounded: false, ringScale: 1 },
  { file: 'maskable-192.png', size: 192, rounded: false, ringScale: 0.8 },
  { file: 'maskable-512.png', size: 512, rounded: false, ringScale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, ringScale: 0.95 },
  { file: 'favicon-32.png', size: 32, rounded: true, ringScale: 1.15 },
];

const splash = [
  [1320, 2868], [1206, 2622], [1260, 2736], [1290, 2796], [1179, 2556], [1284, 2778],
  [1170, 2532], [1080, 2340], [1125, 2436], [1242, 2688], [828, 1792], [750, 1334],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir(path.join(root, 'icons'), { recursive: true });
await mkdir(path.join(root, 'splash'), { recursive: true });

for (const t of icons) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<style>html,body{margin:0;background:#000}svg{display:block;width:100vw;height:100vh}</style>${svg(t)}`);
  await writeFile(path.join(root, 'icons', t.file), await page.screenshot({ omitBackground: false }));
}
for (const [w, h] of splash) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent('<style>html,body{margin:0;background:#000;height:100%}</style>');
  await writeFile(path.join(root, 'splash', `${w}x${h}.png`), await page.screenshot());
}
await browser.close();
console.log('Ikoner og opstartsbilleder lavet.');
