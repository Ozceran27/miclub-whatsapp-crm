import { access, readdir, readFile } from 'node:fs/promises';
import console from 'node:console';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const skippedDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.local-evidence']);
const markdownLink = /\]\(([^)]+)\)/g;

async function collectMarkdown(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdown(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function linkPath(rawDestination) {
  const value = rawDestination.trim();
  if (!value || /^(#|https?:\/\/|mailto:|codex:\/\/)/.test(value)) return null;
  const unwrapped = value.startsWith('<') ? value.slice(1, value.indexOf('>')) : value.split(/\s+/, 1)[0];
  const [withoutFragment] = unwrapped.split('#', 1);
  const [withoutQuery] = withoutFragment.split('?', 1);
  return decodeURIComponent(withoutQuery);
}

const failures = [];
for (const file of await collectMarkdown(docsRoot)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(markdownLink)) {
    const destination = linkPath(match[1]);
    if (!destination) continue;
    const resolved = path.resolve(path.dirname(file), destination);
    try {
      await access(resolved);
    } catch {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      failures.push(`${path.relative(root, file)}:${line} -> ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error(`Broken local documentation links (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Documentation links: OK');
}
