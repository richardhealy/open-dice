#!/usr/bin/env node
// Renders each dice set in headless Chromium (SwiftShader WebGL), writes PNGs to
// test/render/out/, checks every set differs from Classic and Classic matches the baseline.
//   node test/render/run.mjs [--update-baseline] [--previews] [--sets=ruby-jewel,obsidian-gold]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const previews = args.includes('--previews');
const setsArg = args.find((a) => a.startsWith('--sets='));
const PORT = 5178;
const CLASSIC_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'd100-tens'];   // every type has a pre-branch baseline
const TYPES = ['d20', 'd6', 'd10', 'd100', 'd100-tens'];                                 // set renders and comparisons
// 'd100-tens' renders the second die of a d100 pair (faces 00..90).
const split = (type) => (type.endsWith('-tens') ? [type.slice(0, -5), 'tens'] : [type, 'units']);
const CLASSIC_TOLERANCE = 0.005;
const SET_MIN_DIFF = 0.05;
const IMAGE_MIN_DIFF = 0.01;   // a set's render once its images load vs its first paint without them

const outDir = resolve(here, 'out');
const baselineDir = resolve(here, 'baseline');
const previewDir = resolve(repo, 'docs/sets');
mkdirSync(outDir, { recursive: true });
mkdirSync(baselineDir, { recursive: true });

function startVite() {
    const child = spawn(resolve(repo, 'node_modules/.bin/vite'),
        ['--config', resolve(here, 'vite.config.mjs'), '--port', String(PORT), '--strictPort'],
        { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => process.stderr.write(d));
    return child;
}

async function waitFor(url, ms = 20000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        try { const r = await fetch(url); if (r.ok) return; } catch {}
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`vite did not answer at ${url}`);
}

function savePng(dataUrl, path) {
    writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

const vite = startVite();
let failures = 0;
try {
    await waitFor(`http://localhost:${PORT}/`);
    const browser = await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

    // Set list from the library when it exports listDiceSets (Task 11), else classic only.
    let setIds = await page.evaluate(() => window.__listSets());
    if (setsArg) setIds = ['classic', ...setsArg.slice('--sets='.length).split(',').filter((s) => s && s !== 'classic')];

    for (const setId of setIds) {
        for (const type of (setId === 'classic' ? CLASSIC_TYPES : TYPES)) {
            const dataUrl = await page.evaluate(([s, t, h]) => window.__renderDie(t, s, h), [setId, ...split(type)]);
            savePng(dataUrl, resolve(outDir, `${setId}-${type}.png`));
            if (previews && setId !== 'classic') {
                mkdirSync(previewDir, { recursive: true });
                copyFileSync(resolve(outDir, `${setId}-${type}.png`), resolve(previewDir, `${setId}-${type}.png`));
            }
        }
    }

    // Classic must match the pre-branch baseline for every die type. Baselines were captured
    // from the merge-base source (git archive 3f208be) with this fixture; --update-baseline
    // rewrites them from the current code and is only legitimate after a deliberate change.
    for (const type of CLASSIC_TYPES) {
        const baselinePath = resolve(baselineDir, `classic-${type}.png`);
        if (updateBaseline || !existsSync(baselinePath)) {
            copyFileSync(resolve(outDir, `classic-${type}.png`), baselinePath);
            console.log(`baseline written: ${baselinePath}`);
            continue;
        }
        await page.evaluate((url) => window.__loadBaseline(url), `/baseline/classic-${type}.png?${Date.now()}`);
        const d = await page.evaluate((key) => window.__diff(key, 'baseline'), `classic-${type}`);
        const ok = d <= CLASSIC_TOLERANCE;
        console.log(`${ok ? 'PASS' : 'FAIL'} classic-${type} vs baseline: ${(d * 100).toFixed(3)}% differing (limit ${(CLASSIC_TOLERANCE * 100).toFixed(1)}%)`);
        if (!ok) failures++;
    }

    for (const setId of setIds) {
        if (setId === 'classic') continue;
        for (const type of TYPES) {
            const d = await page.evaluate(([a, b]) => window.__diff(a, b), [`${setId}-${type}`, `classic-${type}`]);
            const ok = d >= SET_MIN_DIFF;
            console.log(`${ok ? 'PASS' : 'FAIL'} ${setId}-${type} differs from classic: ${(d * 100).toFixed(1)}% (needs >= ${(SET_MIN_DIFF * 100).toFixed(0)}%)`);
            if (!ok) failures++;
        }
    }

    // Sets must also differ from one another (a silhouette-only difference from classic
    // would pass the check above even if every set rendered the same).
    const premium = setIds.filter((s) => s !== 'classic');
    for (let i = 1; i < premium.length; i++) {
        const d = await page.evaluate(([a, b]) => window.__diff(a, b), [`${premium[i]}-d20`, `${premium[i - 1]}-d20`]);
        const ok = d >= SET_MIN_DIFF;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${premium[i]}-d20 differs from ${premium[i - 1]}-d20: ${(d * 100).toFixed(1)}% (needs >= ${(SET_MIN_DIFF * 100).toFixed(0)}%)`);
        if (!ok) failures++;
    }

    // Image textures: the fixture registers `fixture-image`, a test-only set whose body and
    // decoration are data-URL PNGs painted in the page (no network). The first paint, before
    // the images load, must show the fallback; after preloadSets the die must repaint with the
    // images (differs from that first paint) and differ from Classic like any other set.
    // The set is excluded from the catalogue loop above and from --previews.
    {
        const unloaded = await page.evaluate(() => window.__renderDie('d20', 'fixture-image', 'units',
            { preload: false, key: 'fixture-image-d20-unloaded' }));
        savePng(unloaded, resolve(outDir, 'fixture-image-d20-unloaded.png'));
        const loaded = await page.evaluate(() => window.__renderDie('d20', 'fixture-image'));
        savePng(loaded, resolve(outDir, 'fixture-image-d20.png'));
        const vsClassic = await page.evaluate(([a, b]) => window.__diff(a, b), ['fixture-image-d20', 'classic-d20']);
        const vsUnloaded = await page.evaluate(([a, b]) => window.__diff(a, b), ['fixture-image-d20', 'fixture-image-d20-unloaded']);
        const ok = vsClassic >= SET_MIN_DIFF && vsUnloaded >= IMAGE_MIN_DIFF;
        console.log(`${ok ? 'PASS' : 'FAIL'} fixture-image (image textures) renders: ${(vsClassic * 100).toFixed(1)}% from classic (needs >= ${(SET_MIN_DIFF * 100).toFixed(0)}%), ${(vsUnloaded * 100).toFixed(1)}% from the unloaded first paint (needs >= ${(IMAGE_MIN_DIFF * 100).toFixed(0)}%)`);
        if (!ok) failures++;
    }

    // The 2x path: a page at devicePixelRatio 2 must get a 2x drawing buffer (the fix for
    // pixelated numerals on Retina displays). The 1x page above cannot see this.
    {
        const hidpi = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 2 });
        const page2 = await hidpi.newPage();
        await page2.goto(`http://localhost:${PORT}/`);
        await page2.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
        await page2.evaluate(() => window.__renderDie('d20', 'ruby-jewel'));
        const buffer = await page2.evaluate(() => { const c = document.querySelector('#stage canvas'); return [c.width, c.height, c.clientWidth]; });
        const ok = buffer[0] === 640 && buffer[1] === 640 && buffer[2] === 320;
        console.log(`${ok ? 'PASS' : 'FAIL'} pixel ratio 2: drawing buffer ${buffer[0]}x${buffer[1]} for a ${buffer[2]}px canvas (needs 640x640)`);
        if (!ok) failures++;
        await hidpi.close();
    }

    if (errors.length) {
        failures++;
        console.log('FAIL page errors:');
        for (const e of errors) console.log('  ' + e);
    }
    await browser.close();
} finally {
    vite.kill();
}
console.log(failures ? `${failures} failure(s). PNGs in ${outDir}` : `all render checks passed. PNGs in ${outDir}`);
process.exit(failures ? 1 : 0);
