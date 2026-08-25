#!/usr/bin/env node
/**
 * One-off source-image optimizer for public/.
 *
 * ViteImageOptimizer (wired into vite.config.js) re-compresses images on every
 * build, but it cannot fix the two things that actually cost the most bytes
 * here: images stored at many times their display size, and photographic PNGs
 * that should be WebP. Those are source-asset problems, so they get fixed once,
 * in the repo, by this script.
 *
 * Run: npm run optimize:images
 *
 * Idempotent — every entry is skipped when the output already exists and is
 * newer than the input, so re-running is free and safe. Pass --force to redo.
 *
 * Display sizes below are the largest CSS box each image occupies (checked
 * against the 4K breakpoints in src/styles and src/pages/*.css), doubled for
 * high-DPR screens. Anything beyond that is bytes the user can never see.
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const FORCE = process.argv.includes('--force');

/**
 * @type {Array<{
 *   in: string, out: string, height?: number, width?: number,
 *   format: 'webp'|'png'|'jpeg', quality?: number, why: string
 * }>}
 */
const JOBS = [
  {
    // Navbar, every page. Rendered at 34px tall (144px at the 4K breakpoint,
    // src/styles/components.css:8376), stored at 608px. Worst byte-per-pixel
    // offender in the repo.
    in: 'logo/streamflix-nav-logo.png',
    out: 'logo/streamflix-nav-logo.webp',
    height: 320,
    format: 'webp',
    quality: 90,
    why: 'navbar logo: 608px tall stored, 144px max displayed',
  },
  {
    // MatchCard fallback background (src/components/MatchCard.jsx:26).
    // 2816x1536 photographic JPEG behind a card.
    in: 'img/sports.jpg',
    out: 'img/sports.webp',
    width: 1600,
    format: 'webp',
    quality: 78,
    why: 'card fallback background: 2816px wide stored',
  },
  {
    // PWA manifest screenshot, declared 390x760 in vite.config.js but stored at
    // 1080x2473. Re-encoded at the declared aspect; Chrome downscales anyway.
    in: 'img/landingpage-mobile.webp',
    out: 'img/landingpage-mobile.webp',
    width: 780,
    format: 'webp',
    quality: 80,
    why: 'PWA screenshot: 1.5 MB for a 390px-wide slot',
  },
  {
    // JSON-LD Organization logo (index.html:92) declares width/height 512 but
    // the file is 1024x1024. Stays PNG — schema.org consumers and social
    // scrapers are less reliable with WebP. Also the GlobalChat avatar
    // fallback (src/lib/globalChatAdminIdentity.js:29).
    in: 'logo/streamflix.png',
    out: 'logo/streamflix.png',
    width: 512,
    height: 512,
    format: 'png',
    quality: 90,
    why: 'JSON-LD logo: declared 512x512, stored 1024x1024',
  },
];

// Provider hero logos. Displayed at max 320px tall / 1200px wide
// (src/pages/StreamingProviderPage.css:281). All are flat-colour brand marks,
// which WebP handles far better than PNG.
for (const file of [
  'apple_tv_plus.png',
  'disney_plus.png',
  'prime_video.png',
  'viu.png',
  'hbo_max.png',
  'netflix.png',
]) {
  JOBS.push({
    in: `provider/${file}`,
    out: `provider/${file.replace(/\.png$/, '.webp')}`,
    height: 640,
    format: 'webp',
    quality: 90,
    why: 'provider hero logo: 320px max displayed',
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function statOrNull(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function run() {
  let totalBefore = 0;
  let totalAfter = 0;
  let done = 0;
  let skipped = 0;

  for (const job of JOBS) {
    const inPath = path.join(PUBLIC, job.in);
    const outPath = path.join(PUBLIC, job.out);
    const inStat = await statOrNull(inPath);

    if (!inStat) {
      console.warn(`  ! missing, skipped: ${job.in}`);
      continue;
    }

    const inPlace = inPath === outPath;
    const outStat = inPlace ? null : await statOrNull(outPath);
    if (!FORCE && outStat && outStat.mtimeMs >= inStat.mtimeMs) {
      skipped++;
      continue;
    }

    // Read into memory rather than letting sharp open the path itself: on
    // Windows sharp keeps a read handle on its input file, which blocks the
    // in-place write/rename below with EPERM. From a buffer there is no handle.
    const inputBuf = await fs.readFile(inPath);
    const pipeline = sharp(inputBuf).rotate(); // honour EXIF, then drop it

    if (job.width || job.height) {
      pipeline.resize({
        width: job.width,
        height: job.height,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (job.format === 'webp') {
      pipeline.webp({ quality: job.quality ?? 82, effort: 6 });
    } else if (job.format === 'png') {
      pipeline.png({ quality: job.quality ?? 90, compressionLevel: 9, palette: true });
    } else {
      pipeline.jpeg({ quality: job.quality ?? 80, mozjpeg: true });
    }

    // Writing in place would have sharp reading the file it is writing, so
    // always render to a buffer first and then replace.
    const buf = await pipeline.toBuffer();

    if (buf.length >= inStat.size && inPlace) {
      console.log(`  = ${job.in}: already optimal (${kb(inStat.size)}), left alone`);
      skipped++;
      continue;
    }

    // On Windows sharp still holds a read handle on the input after toBuffer(),
    // so an in-place fs.writeFile fails with EUNKNOWN. Write a sibling temp file
    // and rename over the target instead — also atomic, so an interrupted run
    // cannot leave a half-written image in the repo.
    const tmpPath = `${outPath}.tmp-${process.pid}`;
    await fs.writeFile(tmpPath, buf);
    await fs.rename(tmpPath, outPath);

    totalBefore += inStat.size;
    totalAfter += buf.length;
    done++;

    const pct = (100 * (1 - buf.length / inStat.size)).toFixed(0);
    const arrow = inPlace ? job.in : `${job.in} -> ${job.out}`;
    console.log(`  + ${arrow}`);
    console.log(`      ${kb(inStat.size)} -> ${kb(buf.length)}  (-${pct}%)   ${job.why}`);
  }

  console.log('');
  console.log(`  ${done} written, ${skipped} up to date`);
  if (done) {
    console.log(
      `  total: ${kb(totalBefore)} -> ${kb(totalAfter)} ` +
      `(-${(100 * (1 - totalAfter / totalBefore)).toFixed(0)}%, ` +
      `${kb(totalBefore - totalAfter)} saved)`
    );
  }
  console.log('');
  console.log('  Note: .png -> .webp conversions leave the original in place.');
  console.log('  Update the referencing source files, then delete the PNGs.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
