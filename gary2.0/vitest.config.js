import { defineConfig } from 'vitest/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    // RETIRED FROM THE RUN (founder, Oct 13 2026: "why do we have 3,727 tests? ... that just feels like it wastes a
    // shit ton of usage"). These only pinned wording or app source text, so every deliberate change to a prompt or
    // a screen broke them and cost a rewrite. The Xcode build checks the app's code now. The files stay in the repo
    // until the founder confirms the delete.
    exclude: ['**/node_modules/**', 'tests/scripts/ios*.test.js', 'tests/services/agentic/nflPrompts.test.js',
      'tests/orchestrator/pass2Mlb.test.js', 'tests/services/agentic/rationaleWritingRules.test.js',
      'tests/services/agentic/evidenceQuality.test.js'],
    environment: 'node',
    // Pure calendar tests import a module that initializes a Supabase client.
    // Unit tests need valid-shaped placeholders, never a copied production .env.
    env: {
      SUPABASE_URL: 'https://example.supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      // Codex cap memory is persisted; tests must never write the production file.
      GARY_CODEX_CAP_FILE: join(tmpdir(), 'gary-vitest-codex-caps.json'),
      // Write-up reuse is a production cache; tests always reach the model stub.
      GARY_LANE_READ_CACHE: 'off',
    },
  }
});
