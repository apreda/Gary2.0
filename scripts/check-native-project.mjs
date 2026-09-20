import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run on macOS, where plutil understands Xcode's OpenStep project format.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'ios/GaryApp');
const project = JSON.parse(execFileSync('plutil', [
  '-convert', 'json', '-o', '-', join(app, 'GaryApp.xcodeproj/project.pbxproj'),
], { encoding: 'utf8' }));
const objects = project.objects;
const paths = new Map();
const parents = new Map();
const problems = [];

function visit(id, parentPath = app) {
  const entry = objects[id];
  if (!entry) throw new Error(`Missing Xcode object: ${id}`);
  if (parents.has(id)) {
    problems.push(`Duplicate group membership: ${entry.path ?? entry.name ?? id}`);
    return;
  }
  parents.set(id, parentPath);
  const path = resolve(parentPath, entry.path ?? '');
  if (entry.isa === 'PBXGroup') {
    for (const child of entry.children ?? []) visit(child, path);
  } else if (entry.isa === 'PBXFileReference') {
    paths.set(id, path);
  }
}
visit(objects[project.rootObject].mainGroup);

const compiled = new Set();
for (const phase of Object.values(objects)) {
  if (!['PBXSourcesBuildPhase', 'PBXResourcesBuildPhase'].includes(phase.isa)) continue;
  for (const id of phase.files) {
    const path = paths.get(objects[id].fileRef);
    if (path?.endsWith('.example')) problems.push(`Configuration template bundled: ${path}`);
    if (phase.isa !== 'PBXSourcesBuildPhase' || !path?.endsWith('.swift')) continue;
    if (compiled.has(path)) problems.push(`Swift source compiled twice: ${path}`);
    compiled.add(path);
  }
}

function swiftFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || /^(build|ci_scripts|supabase)$|\.xcodeproj$|\.xcworkspace$/.test(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? swiftFiles(path) : entry.name.endsWith('.swift') ? [path] : [];
  });
}
const expected = new Set(swiftFiles(app));
for (const path of expected) if (!compiled.has(path)) problems.push(`Swift source missing from target: ${path}`);
for (const path of compiled) if (!expected.has(path)) problems.push(`Target references missing Swift source: ${path}`);
if (problems.length) throw new Error(problems.join('\n'));
console.log(`Native project verified: ${compiled.size} Swift files, unique groups, no bundled configuration templates.`);
