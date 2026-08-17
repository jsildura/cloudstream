const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const AVATAR_DIR = path.resolve(__dirname, '../public/avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

// 8 Adult avatars + 4 Kids avatars
const avatars = [
  // Adult (1 - 8)
  { id: 'avatar_01', bg1: '#e50914', bg2: '#b20710', emoji: '🎬', label: 'Classic Red' },
  { id: 'avatar_02', bg1: '#3b82f6', bg2: '#1d4ed8', emoji: '🚀', label: 'Sci-Fi Blue' },
  { id: 'avatar_03', bg1: '#8b5cf6', bg2: '#6d28d9', emoji: '🔮', label: 'Mystery Purple' },
  { id: 'avatar_04', bg1: '#10b981', bg2: '#047857', emoji: '🌿', label: 'Adventure Emerald' },
  { id: 'avatar_05', bg1: '#f59e0b', bg2: '#d97706', emoji: '🍿', label: 'Cinema Amber' },
  { id: 'avatar_06', bg1: '#ec4899', bg2: '#be185d', emoji: '🎭', label: 'Drama Rose' },
  { id: 'avatar_07', bg1: '#06b6d4', bg2: '#0e7490', emoji: '⚡', label: 'Action Cyan' },
  { id: 'avatar_08', bg1: '#64748b', bg2: '#334155', emoji: '🕶️', label: 'Noir Slate' },
  // Kids (9 - 12)
  { id: 'avatar_09', bg1: '#fbbf24', bg2: '#f59e0b', emoji: '🦁', label: 'Lion Sun' },
  { id: 'avatar_10', bg1: '#a855f7', bg2: '#7c3aed', emoji: '🦄', label: 'Magic Pony' },
  { id: 'avatar_11', bg1: '#38bdf8', bg2: '#0284c7', emoji: '🐬', label: 'Dolphin Splash' },
  { id: 'avatar_12', bg1: '#4ade80', bg2: '#16a34a', emoji: '🦖', label: 'Dino Green' },
];

async function generateAll() {
  for (const item of avatars) {
    const svg = `
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad_${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${item.bg1}" />
            <stop offset="100%" stop-color="${item.bg2}" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="20" fill="url(#grad_${item.id})" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
        <text x="50" y="60" font-size="38" text-anchor="middle" dominant-baseline="central">${item.emoji}</text>
      </svg>
    `;

    const outPath = path.join(AVATAR_DIR, `${item.id}.webp`);
    await sharp(Buffer.from(svg))
      .resize(100, 100)
      .webp({ quality: 90 })
      .toFile(outPath);

    console.log(`Generated ${item.id}.webp`);
  }
}

generateAll().then(() => console.log('All 12 avatars generated!'));
