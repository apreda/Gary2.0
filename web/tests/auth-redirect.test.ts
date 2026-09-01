import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/auth/redirect';

describe('safeNextPath', () => {
  it('keeps internal paths, queries, and fragments', () => {
    expect(safeNextPath('/today')).toBe('/today');
    expect(safeNextPath('/you?window=30d#ledger')).toBe('/you?window=30d#ledger');
  });

  it('falls back for external and protocol-relative targets', () => {
    expect(safeNextPath('https://evil.example/steal')).toBe('/account');
    expect(safeNextPath('//evil.example/steal')).toBe('/account');
    expect(safeNextPath('/\\evil.example/steal')).toBe('/account');
    expect(safeNextPath('/%2F%2Fevil.example/steal')).toBe('/account');
  });

  it('falls back for non-path and malformed values', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe('/account');
    expect(safeNextPath('%')).toBe('/account');
    expect(safeNextPath('/%E0%A4%A')).toBe('/account');
    expect(safeNextPath(null, '/today')).toBe('/today');
  });
});
