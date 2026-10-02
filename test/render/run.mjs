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
const TYPES = ['d20', 'd6'];
const CLASSIC_TOLERANCE = 0.005;
const SET_MIN_DIFF = 0.05;

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
        for (const type of TYPES) {
            const dataUrl = await page.evaluate(([s, t]) => window.__renderDie(t, s), [setId, type]);
            savePng(dataUrl, resolve(outDir, `${setId}-${type}.png`));
            if (previews && setId !== 'classic') {
                mkdirSync(previewDir, { recursive: true });
                copyFileSync(resolve(outDir, `${setId}-${type}.png`), resolve(previewDir, `${setId}-${type}.png`));
            }
        }
    }

    const baselinePath = resolve(baselineDir, 'classic-d20.png');
    if (updateBaseline || !existsSync(baselinePath)) {
        copyFileSync(resolve(outDir, 'classic-d20.png'), baselinePath);
        console.log(`baseline written: ${baselinePath}`);
    } else {
        await page.evaluate((url) => window.__loadBaseline(url), `/baseline/classic-d20.png?${Date.now()}`);
        const d = await page.evaluate(() => window.__diff('classic-d20', 'baseline'));
        const ok = d <= CLASSIC_TOLERANCE;
        console.log(`${ok ? 'PASS' : 'FAIL'} classic-d20 vs baseline: ${(d * 100).toFixed(3)}% differing (limit ${(CLASSIC_TOLERANCE * 100).toFixed(1)}%)`);
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
