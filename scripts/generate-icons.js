#!/usr/bin/env node
/**
 * Generates all Android mipmap launcher icon PNGs from a source image URL.
 * Source image: https://i.imgur.com/jaWX13k.png
 *
 * Android icon sizes (px):
 *   mdpi:    48x48  (launcher), 108x108  (foreground)
 *   hdpi:    72x72  (launcher), 162x162  (foreground)
 *   xhdpi:   96x96  (launcher), 216x216  (foreground)
 *   xxhdpi: 144x144 (launcher), 324x324  (foreground)
 *   xxxhdpi:192x192 (launcher), 432x432  (foreground)
 *
 * The foreground layer is 2.25x the launcher size because Android adaptive
 * icons use a 108dp canvas with a 72dp safe zone (ratio = 108/72 = 1.5),
 * but we use 1:1 to fill the full adaptive canvas so the icon looks full-bleed.
 */

import https from 'https';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SOURCE_URL = 'https://i.imgur.com/jaWX13k.png';
const TMP_SOURCE = join('/tmp', 'quickstack-icon-source.png');

const ANDROID_RES = join(
  PROJECT_ROOT,
  'android/app/src/main/res'
);

const DENSITIES = [
  { dir: 'mipmap-mdpi',    launcher: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    launcher: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   launcher: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function generate() {
  console.log('Downloading source icon from Imgur...');
  await download(SOURCE_URL, TMP_SOURCE);
  console.log(`  Saved to ${TMP_SOURCE}`);

  const src = sharp(TMP_SOURCE);
  const meta = await src.metadata();
  console.log(`  Source dimensions: ${meta.width}x${meta.height}`);

  for (const density of DENSITIES) {
    const outDir = join(ANDROID_RES, density.dir);
    mkdirSync(outDir, { recursive: true });

    // Standard launcher icon (square)
    const launcherOut = join(outDir, 'ic_launcher.png');
    await sharp(TMP_SOURCE)
      .resize(density.launcher, density.launcher, { fit: 'cover' })
      .png()
      .toFile(launcherOut);
    console.log(`  ${density.dir}/ic_launcher.png  (${density.launcher}x${density.launcher})`);

    // Round launcher icon (circle-cropped)
    const size = density.launcher;
    const half = size / 2;
    const circleMask = Buffer.from(
      `<svg><circle cx="${half}" cy="${half}" r="${half}" /></svg>`
    );
    const roundOut = join(outDir, 'ic_launcher_round.png');
    await sharp(TMP_SOURCE)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toFile(roundOut);
    console.log(`  ${density.dir}/ic_launcher_round.png  (${size}x${size})`);

    // Adaptive icon foreground (full-bleed on 108dp canvas)
    const fgSize = density.foreground;
    const fgOut = join(outDir, 'ic_launcher_foreground.png');
    await sharp(TMP_SOURCE)
      .resize(fgSize, fgSize, { fit: 'cover' })
      .png()
      .toFile(fgOut);
    console.log(`  ${density.dir}/ic_launcher_foreground.png  (${fgSize}x${fgSize})`);
  }

  console.log('\nDone! All Android mipmap icons generated.');
  console.log('Run `npm run cap:sync` to sync changes to the Android project.');
}

generate().catch((err) => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
