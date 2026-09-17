import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WINNERS_INVITATION_BODY, WinnersInvitation } from '@/components/WinnersInvitation';

describe('WinnersInvitation', () => {
  it('uses the approved sentence and links to Winners without promising a count or a result', () => {
    const html = renderToStaticMarkup(createElement(WinnersInvitation));
    expect(WINNERS_INVITATION_BODY).toBe('Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.');
    expect(html).toContain('href="/winners"');
    expect(html).toContain('See Winners');
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/exactly|three|four|guarantee|winning bet/i);
  });
});
