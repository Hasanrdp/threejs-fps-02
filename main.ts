// Emberworks entry (Node 22, standard library only). The game lives in game/ beside
// this file as plain static files the browser loads as ES modules, three.js coming
// from the import map; this program hands the whole entry in. It copies game/ and
// screenshots/ to the output directory and writes dossier.json there with the
// vendored make.fun library, which is the summary the judge reads.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const dest = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTree(name) {
  const from = join(root, name);
  if (!existsSync(from)) return;
  cpSync(from, join(dest, name), { recursive: true });
}

mkdirSync(dest, { recursive: true });
copyTree('game');
mkdirSync(join(dest, 'screenshots'), { recursive: true });
copyTree('screenshots');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all: game/
// counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossier = buildDossier(dest, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(dest, 'dossier.json'), dossier);
