import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checks = vi.hoisted(() => ({
  exec: vi.fn(),
  diskEras: vi.fn(),
  junePromptSha: vi.fn(),
  storedPicks: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../src/loadEnv.js', () => ({}));
vi.mock('child_process', () => ({ execSync: checks.exec }));
vi.mock('../../scripts/lib/eraTruth.js', () => ({
  PROJECT_DIR: '/gary/gary2.0',
  gitStamp: () => 'abc123',
  diskEras: checks.diskEras,
}));
vi.mock('../../src/services/agentic/orchestrator/junePromptSha.js', () => ({
  junePromptSha: checks.junePromptSha,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: checks.storedPicks }) }) }),
  }),
}));
vi.mock('fs', () => ({
  readdirSync: (path) => path.endsWith('/functions') ? ['grade-results'] : ['index.ts'],
  readFileSync: checks.readFile,
  existsSync: () => true,
  statSync: () => ({ isDirectory: () => true }),
}));

function healthyCommand(command) {
  if (command.startsWith('pgrep')) return '123 /gary/gary2.0/scripts/scheduler.js';
  if (command.startsWith('plutil')) return '"GARY_MODEL_OVERRIDE" => "model"';
  if (command.startsWith('npx supabase')) {
    return JSON.stringify([{ slug: 'grade-results', updated_at: 2_000_000_000_000, version: 1 }]);
  }
  if (command.startsWith('git log')) return '1000000000';
  if (command.startsWith('git status')) return '';
  if (command.startsWith('git rev-list')) return '0';
  throw new Error(`Unexpected command: ${command}`);
}

async function runCheck() {
  await expect(import('../../scripts/production-truth.js')).rejects.toThrow('test exit');
  return {
    exitCode: process.exit.mock.calls[0][0],
    output: console.log.mock.calls.map((args) => args.join(' ')).join('\n'),
  };
}

beforeEach(() => {
  vi.resetModules();
  checks.exec.mockReset().mockImplementation(healthyCommand);
  checks.diskEras.mockReset().mockReturnValue({ game: 'game-era', props: 'props-era' });
  checks.junePromptSha.mockReset().mockReturnValue('game-era');
  checks.storedPicks.mockReset().mockResolvedValue({ data: null, error: null });
  checks.readFile.mockReset().mockReturnValue('import "../_shared/example.ts";');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('test exit'); });
});

afterEach(() => vi.restoreAllMocks());

describe('production truth reports a failing exit status when evidence is missing', () => {
  it('succeeds when every check succeeds, including a day with no picks', async () => {
    const result = await runCheck();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('no game picks yet');
    expect(result.output).toContain('✅ Production is this repo.');
  });

  it.each([
    ['scheduler inspection', 'pgrep'],
    ['launchd configuration', 'plutil'],
    ['deployment API', 'npx supabase'],
    ['deployment git history', 'git log'],
    ['deployment dirty-file inspection', 'git status --porcelain --'],
    ['working tree inspection', 'git status --porcelain'],
    ['upstream comparison', 'git rev-list'],
  ])('fails when %s cannot be checked', async (_label, prefix) => {
    checks.exec.mockImplementation((command) => {
      if (command.startsWith(prefix)) throw new Error('check unavailable');
      return healthyCommand(command);
    });
    const result = await runCheck();
    expect(result.exitCode).toBe(1);
    expect(result.output).not.toContain('✅ Production is this repo.');
  });

  it.each(['diskEras', 'junePromptSha'])('fails when %s cannot be read', async (name) => {
    checks[name].mockImplementation(() => { throw new Error('era unavailable'); });
    expect((await runCheck()).exitCode).toBe(1);
  });

  it('does not report a failed database query as an empty slate', async () => {
    checks.storedPicks.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const result = await runCheck();
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('database unavailable');
    expect(result.output).not.toContain('no game picks yet');
  });

  it('fails when a function source cannot be inspected for shared dependencies', async () => {
    checks.readFile.mockImplementation(() => { throw new Error('file unreadable'); });
    expect((await runCheck()).exitCode).toBe(1);
  });

  it('fails for uncommitted work outside edge function directories', async () => {
    checks.exec.mockImplementation((command) => command === 'git status --porcelain'
      ? ' M scripts/scheduler.js' : healthyCommand(command));
    expect((await runCheck()).exitCode).toBe(1);
  });

  it('fails for commits that have not reached the upstream branch', async () => {
    checks.exec.mockImplementation((command) => command.startsWith('git rev-list')
      ? '2' : healthyCommand(command));
    expect((await runCheck()).exitCode).toBe(1);
  });
});
