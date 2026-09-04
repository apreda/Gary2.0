import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    // Pure calendar tests import a module that initializes a Supabase client.
    // Unit tests need valid-shaped placeholders, never a copied production .env.
    env: {
      SUPABASE_URL: 'https://example.supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
    },
  }
});
