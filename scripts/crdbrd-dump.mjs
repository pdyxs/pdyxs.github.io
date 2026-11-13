// Node entry for scripts/crdbrd-dump (the launcher). Reads the Firebase
// service-account key from the CRDBRD_FIREBASE_KEY env var, set by the launcher
// for this process only. firebase-admin is a devDependency and is imported
// dynamically here, so nothing the site build loads ever touches it.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, isInside } from '../src/modules/crdbrd/import/dump.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const outDir = resolve(flag('--out') ?? `${process.env.HOME}/crdbrd-dump`);
if (isInside(outDir, repoRoot)) {
  console.error(`Refusing to dump inside the repo: ${outDir}`);
  process.exit(2);
}
const raw = process.env.CRDBRD_FIREBASE_KEY;
if (!raw) {
  console.error('CRDBRD_FIREBASE_KEY is not set; run via scripts/crdbrd-dump.');
  process.exit(2);
}
let key;
try {
  key = JSON.parse(raw);
} catch {
  console.error('The stored key is not valid JSON (contents not shown).');
  process.exit(2);
}
delete process.env.CRDBRD_FIREBASE_KEY;

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');
const bucketName = flag('--bucket') ?? `${key.project_id}.appspot.com`;
const app = initializeApp({ credential: cert(key), storageBucket: bucketName });
const bucket = getStorage(app).bucket();

const storage = {
  async listFiles(prefix) {
    const [files] = await bucket.getFiles({ prefix });
    return files.map((f) => f.name).filter((n) => !n.endsWith('/'));
  },
  async read(name) {
    const [buf] = await bucket.file(name).download();
    return buf;
  },
};

const manifest = await dump({
  firestore: getFirestore(app),
  storage,
  outDir,
  fs: { mkdir, writeFile },
  game: flag('--game'),
});
console.log(`Dumped ${manifest.documents} documents and ${manifest.files} files from ${manifest.games.length} game(s) to ${outDir}`);
for (const g of manifest.games) console.log(`  ${g.id}  ${g.name ?? '(unnamed)'}  ${g.documents} docs, ${g.files} files`);
