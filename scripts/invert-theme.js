const sharp = require('sharp');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'assets/images');

async function invertToMonochrome(inputPath, outputPath, { bgHex = '#0A0A0A' } = {}) {
  const bg = {
    r: parseInt(bgHex.slice(1, 3), 16),
    g: parseInt(bgHex.slice(3, 5), 16),
    b: parseInt(bgHex.slice(5, 7), 16),
  };

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;

    let t;
    if (brightness >= 240) t = 1;
    else if (brightness <= 180) t = 0;
    else t = (brightness - 180) / (240 - 180);

    out[i] = Math.round(bg.r + (255 - bg.r) * t);
    out[i + 1] = Math.round(bg.g + (255 - bg.g) * t);
    out[i + 2] = Math.round(bg.b + (255 - bg.b) * t);
  }

  await sharp(out, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  console.log(`✓ ${path.relative(ROOT, outputPath)}`);
}

async function main() {
  const targets = [
    'icon.png',
    'adaptive-icon.png',
    'splash-icon.png',
    'favicon.png',
  ];

  for (const name of targets) {
    const input = path.join(IMAGES_DIR, name);
    const output = path.join(IMAGES_DIR, name);
    await invertToMonochrome(input, output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
