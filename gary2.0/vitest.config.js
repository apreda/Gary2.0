import { defineConfig } from 'vitest/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
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
