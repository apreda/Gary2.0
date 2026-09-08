import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPage from '@/app/privacy/page';

describe('native reading consent disclosure', () => {
  it('describes the separate limited card scope and ephemeral identity without changing the checkout grant', () => {
    const html = renderToStaticMarkup(PrivacyPage());
    expect(html).toContain('Share product analytics');
    expect(html).toContain('Share reading analytics');
    expect(html).toContain('separate permission, off by default');
    expect(html).toContain('expanded original pick or prop reasoning');
    expect(html).toContain('five continuous foreground');
    expect(html).toContain('do not link visits across app launches');
    expect(html).toContain('independent of the plan and checkout analytics setting');
  });
});
