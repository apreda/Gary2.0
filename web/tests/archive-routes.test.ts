import { describe, expect, it } from 'vitest';
import { generateStaticParams as generateArchiveDateParams } from '@/app/archive/[date]/page';
import { generateStaticParams as generateArchiveMonthParams } from '@/app/archive/month/[month]/page';

describe('archive ISR routes', () => {
  it('opts open-ended dates and months into on-demand static generation', () => {
    expect(generateArchiveDateParams()).toEqual([]);
    expect(generateArchiveMonthParams()).toEqual([]);
  });
});
