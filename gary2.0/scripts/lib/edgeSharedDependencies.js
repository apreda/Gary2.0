import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

/** Follow literal local imports so one shared helper edit does not invalidate
 * unrelated functions. Unreadable/missing local dependencies fail verification.
 */
export function edgeSharedDependencies(functionRoot, name, io = { existsSync, readFileSync }) {
  const root = resolve(functionRoot);
  const visited = new Set();
  const shared = new Set();
  const walk = (path) => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = io.readFileSync(path, 'utf8');
    if (relative(root, path).startsWith('_shared/')) shared.add(relative(root, path));
    const imports = source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(path), specifier);
      const dependency = [target, `${target}.ts`, `${target}.js`, join(target, 'index.ts'), join(target, 'index.js')]
        .find((candidate) => io.existsSync(candidate));
      if (!dependency) throw new Error(`Missing local edge dependency: ${relative(root, target)}`);
      if (/\.[cm]?[jt]sx?$/.test(dependency)) walk(dependency);
    }
  };
  walk(join(root, name, 'index.ts'));
  return [...shared].sort();
}
