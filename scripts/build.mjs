import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(path.join(out, 'server'), { recursive: true });
fs.mkdirSync(path.join(out, '.openai'), { recursive: true });
fs.copyFileSync(path.join(root, 'worker', 'index.js'), path.join(out, 'server', 'index.js'));
fs.copyFileSync(path.join(root, '.openai', 'hosting.json'), path.join(out, '.openai', 'hosting.json'));
console.log(`Built ${out}`);

