// Generates the trailer voice-over through the project's deployed `tts` edge function
// (ElevenLabs). Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from ../.env at runtime;
// the values are only ever sent as request headers and are never printed or written.
//
//   node scripts/vo.mjs            # generate missing lines
//   node scripts/vo.mjs mom        # (re)generate one line
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'public', 'vo');
fs.mkdirSync(outDir, { recursive: true });

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}
const env = readEnv(path.resolve(root, '..', '.env'));
const BASE = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.VITE_SUPABASE_ANON_KEY || '';
if (!BASE || !KEY) {
  console.error('Missing Supabase config in ../.env');
  process.exit(1);
}

// voice IDs: ElevenLabs default voices (see ../src/core/voiceCast.ts)
const V = {
  Matilda: 'XrExE9yKIg1WjnnlVkGX',
  Sarah: 'EXAVITQu4vr4xnSDxMaL',
  Jessica: 'cgSgspJ2msm6clMCkdW9',
  Brian: 'nPczCjzI2devNBz1zQrb',
  Lily: 'pFZP5JQG7iQjIQuC4Bku',
};

export const LINES = [
  { name: 'mom', voice: 'Matilda', text: 'Can you get milk, two tomatoes and potatoes? Back before dinner, okay?', emotion: 'warm', speed: 1.1, accent: 'indian' },
  { name: 'helper', voice: 'Sarah', text: 'Sorry! Milk is sold out.', emotion: 'apologetic', speed: 1.05 },
  { name: 'sibling', voice: 'Jessica', text: 'Hey! Those are MY crayons!', emotion: 'angry', speed: 1.1 },
  { name: 'narrator1', voice: 'Brian', text: "Real life doesn't come with a tutorial.", emotion: 'calm', speed: 0.95 },
  { name: 'grandma', voice: 'Lily', text: 'You did it! Well done!', emotion: 'proud', speed: 0.95 },
  { name: 'narrator2', voice: 'Brian', text: 'LifeQuest. Real life. Your rules.', emotion: 'proud', speed: 0.95 },
];

async function gen(line) {
  const body = { text: line.text, voiceId: V[line.voice], emotion: line.emotion, speed: line.speed, accent: line.accent ?? 'none' };
  const r = await fetch(`${BASE}/functions/v1/tts`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const type = r.headers.get('content-type') || '';
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`${line.name}: HTTP ${r.status} ${t.slice(0, 200)}`);
  }
  let bytes;
  let model = r.headers.get('x-tts-model') || '?';
  if (type.includes('application/json')) {
    const j = await r.json();
    if (!j.url) throw new Error(`${line.name}: no url in response`);
    model = j.model || model;
    const a = await fetch(j.url);
    if (!a.ok) throw new Error(`${line.name}: download HTTP ${a.status}`);
    bytes = Buffer.from(await a.arrayBuffer());
  } else {
    bytes = Buffer.from(await r.arrayBuffer());
  }
  const file = path.join(outDir, `${line.name}.mp3`);
  fs.writeFileSync(file, bytes);
  console.log(`${line.name}: ${line.voice}/${line.emotion} ${line.text.length} chars, model ${model}, ${bytes.length} bytes`);
}

const only = process.argv.slice(2);
for (const line of LINES) {
  const file = path.join(outDir, `${line.name}.mp3`);
  if (only.length ? !only.includes(line.name) : fs.existsSync(file)) continue;
  try {
    await gen(line);
  } catch (e) {
    console.error(String(e.message || e));
  }
}
