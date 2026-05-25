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
 */

import https from 'https';
import { createWriteStream, mkdirSync, statSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve project root as the parent of the scripts/ directory.
// Use resolve() to get a canonical absolute path regardless of CWD.
const PROJECT_ROOT = resolve(__dirname, '..');
const ANDROID_RES = join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'res');

if (!existsSync(ANDROID_RES)) {
  console.error(`ERROR: Android res directory not found at:\n  ${ANDROID_RES}`);
  console.error('Make sure the Android project is initialized (run: npx cap add android)');
  process.exit(1);
}

const SOURCE_URL = 'https://i.imgur.com/jaWX13k.png';
const TMP_SOURCE = '/tmp/quickstack-icon-source.png';

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

function verifyWritten(filePath, minBytes = 100) {
  const size = statSync(filePath).size;
  if (size < minBytes) {
    throw new Error(`Output file looks empty: ${filePath} (${size} bytes)`);
  }
  return size;
}

async function generate() {
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Android res:  ${ANDROID_RES}\n`);

  console.log('Downloading source icon from Imgur...');
  await download(SOURCE_URL, TMP_SOURCE);
  const srcSize = statSync(TMP_SOURCE).size;
  console.log(`  Saved to ${TMP_SOURCE} (${srcSize} bytes)`);

  const meta = await sharp(TMP_SOURCE).metadata();
  console.log(`  Source dimensions: ${meta.width}x${meta.height}\n`);

  for (const density of DENSITIES) {
    const outDir = join(ANDROID_RES, density.dir);
    mkdirSync(outDir, { recursive: true });

    const size = density.launcher;
    const half = size / 2;
    const circleMask = Buffer.from(
      `<svg><circle cx="${half}" cy="${half}" r="${half}" /></svg>`
    );

    const launcherOut = join(outDir, 'ic_launcher.png');
    await sharp(TMP_SOURCE)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(launcherOut);
    console.log(`  ${density.dir}/ic_launcher.png  (${size}x${size})  ${verifyWritten(launcherOut)} bytes`);

    const roundOut = join(outDir, 'ic_launcher_round.png');
    await sharp(TMP_SOURCE)
      .resize(size, size, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toFile(roundOut);
    console.log(`  ${density.dir}/ic_launcher_round.png  (${size}x${size})  ${verifyWritten(roundOut)} bytes`);

    const fgSize = density.foreground;
    const fgOut = join(outDir, 'ic_launcher_foreground.png');
    await sharp(TMP_SOURCE)
      .resize(fgSize, fgSize, { fit: 'cover' })
      .png()
      .toFile(fgOut);
    console.log(`  ${density.dir}/ic_launcher_foreground.png  (${fgSize}x${fgSize})  ${verifyWritten(fgOut)} bytes\n`);
  }

  console.log('Done! All Android mipmap icons generated from your Imgur logo.');
  console.log('Run `npm run cap:sync` to sync changes to the Android project.');
}

generate().catch((err) => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
