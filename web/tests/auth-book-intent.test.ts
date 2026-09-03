import { describe, expect, it } from 'vitest';
import {
  bookIntentAccountHref,
  clearBookIntent,
  gameIntentKey,
  propIntentKey,
  readBookIntent,
  withBookIntent,
} from '@/lib/auth/book-intent';

describe('book auth intent', () => {
  it('round-trips a game-side choice without placing anything', () => {
    const next = withBookIntent('/picks?league=mlb#board', {
      kind: 'game',
      side: 'tail',
      key: gameIntentKey('pick-123', 'Astros ML'),
    });
    const parsed = new URL(next, 'https://gary.local');

    expect(readBookIntent(parsed.search)).toEqual({
      kind: 'game',
      side: 'tail',
      key: 'game:pick-123',
    });
    expect(parsed.hash).toBe('#board');
  });

  it('keeps prop identity stable and encodes it into the account return URL', () => {
    expect(propIntentKey('Luis Castillo', 'strikeouts')).toBe('prop:luis castillo:strikeouts');
    expect(bookIntentAccountHref('/props', {
      kind: 'prop',
      side: 'fade',
      key: 'prop:luis castillo:strikeouts',
    })).toContain('next=%2Fprops%3Fbook_kind%3Dprop');
  });

  it('clears only transient Book keys after the UI resumes', () => {
    expect(clearBookIntent('/picks?league=mlb&book_kind=game&book_side=fade&book_key=game%3A1#board'))
      .toBe('/picks?league=mlb#board');
  });

  it('rejects incomplete intent values', () => {
    expect(readBookIntent('?book_kind=game&book_side=tail')).toBeNull();
    expect(readBookIntent('?book_kind=other&book_side=tail&book_key=x')).toBeNull();
  });
});
