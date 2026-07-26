import { describe, it, expect } from 'vitest';
import { extractSection, insertAfterHeader } from '../../../src/services/pickdesk/sectionText.js';

const REPORT = `HEADER BLOCK

═══ PROBABLE PITCHERS ═══
pitcher lines

═══ INJURIES (BDL Structured) ═══
injury lines

═══ TODAY'S BREAKING NEWS ═══
news line one
news line two`;

describe('extractSection', () => {
  it('pulls a section out and removes it from the rest', () => {
    const { section, rest } = extractSection(REPORT, `═══ TODAY'S BREAKING NEWS ═══`);
    expect(section).toContain('news line one');
    expect(section).toContain('news line two');
    expect(rest).not.toContain('news line one');
    expect(rest).toContain('pitcher lines');
  });

  it('extracts an interior section without eating the next header', () => {
    const { section, rest } = extractSection(REPORT, `═══ INJURIES (BDL Structured) ═══`);
    expect(section).toContain('injury lines');
    expect(section).not.toContain('BREAKING NEWS');
    expect(rest).toContain(`═══ TODAY'S BREAKING NEWS ═══`);
  });

  it('missing header returns null and the unchanged text', () => {
    const { section, rest } = extractSection(REPORT, '═══ NOT A SECTION ═══');
    expect(section).toBeNull();
    expect(rest).toBe(REPORT);
  });
});

describe('insertAfterHeader', () => {
  it('places lines directly under the header', () => {
    const out = insertAfterHeader(REPORT, `═══ INJURIES (BDL Structured) ═══`, 'LEGEND LINE');
    const i = out.indexOf(`═══ INJURIES (BDL Structured) ═══`);
    const legend = out.indexOf('LEGEND LINE');
    const body = out.indexOf('injury lines');
    expect(legend).toBeGreaterThan(i);
    expect(legend).toBeLessThan(body);
  });

  it('missing header leaves text unchanged', () => {
    expect(insertAfterHeader(REPORT, '═══ NOPE ═══', 'X')).toBe(REPORT);
  });
});
