import type { InjuryEntry, InjuryReport, PropPick } from './types';

const EST = 'America/New_York';

/* ── Injuries ────────────────────────────────────────────────────────────── */

function injuryEntryText(entry: InjuryEntry): string | null {
  const name = (entry.name ?? '').trim();
  if (!name) return null;
  const status = (entry.status ?? '').trim();
  const description = (entry.description ?? '').trim();
  return `${name}${status ? ` (${status})` : ''}${description ? ` — ${description}` : ''}`;
}

/**
 * The injury note as printable lines. MLB picks store a sentence; football
 * picks store `{ away: [...], home: [...] }` lists — one line per side that
 * has anyone listed, led by that side's club name. Sep 2 2026: every NCAAF
 * game page threw "Objects are not valid as a React child" on the raw field.
 */
export function injuryLines(
  injuries: string | InjuryReport | null | undefined,
  awayTeam?: string | null,
  homeTeam?: string | null,
): string[] {
  if (injuries == null) return [];
  if (typeof injuries === 'string') {
    const text = injuries.trim();
    return text ? [text] : [];
  }
  if (typeof injuries !== 'object') return [];
  const side = (label: string | null | undefined, entries: InjuryEntry[] | null | undefined): string | null => {
    const items = (Array.isArray(entries) ? entries : [])
      .map(entry => (entry && typeof entry === 'object' ? injuryEntryText(entry) : null))
      .filter((text): text is string => !!text);
    if (items.length === 0) return null;
    const lead = (label ?? '').trim();
    return `${lead ? `${lead}: ` : ''}${items.join('; ')}`;
  };
  return [side(awayTeam, injuries.away), side(homeTeam, injuries.home)]
    .filter((line): line is string => !!line);
}

/* ── Time ────────────────────────────────────────────────────────────────── */

/**
 * Postgres hands back `2026-07-27 18:35:00+00`; the picks JSON carries proper
 * ISO. Both must parse in every browser — Safari rejects the space form and
 * the bare `+00` offset — so normalize before constructing the Date.
 */
export function parseGameTime(raw?: string | null): Date | null {
  if (!raw) return null;
  let s = raw.trim().replace(' ', 'T');
  if (/[+-]\d{2}$/.test(s)) s += ':00';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2:35 PM" in ET — the only clock the board speaks. */
export function etTime(raw?: string | null): string | null {
  const d = parseGameTime(raw);
  if (!d) return null;
  return d
    .toLocaleTimeString('en-US', { timeZone: EST, hour: 'numeric', minute: '2-digit' })
    .replace(/ /g, ' ');
}

/** "Mon, Jul 27" — masthead meta, ET. */
export function etDateLabel(date: string): string {
  const d = parseGameTime(`${date}T12:00:00Z`);
  if (!d) return date;
  return d.toLocaleDateString('en-US', { timeZone: EST, weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Gary posts each game's call about 90 minutes before first pitch (the app's
 * "PICK ~1:05 PM" line). The board says the same thing rather than leaving a
 * game blank.
 */
export function pickDropTime(raw?: string | null): string | null {
  const d = parseGameTime(raw);
  if (!d) return null;
  return etTime(new Date(d.getTime() - 90 * 60_000).toISOString());
}

/* ── Odds ────────────────────────────────────────────────────────────────── */

/** American odds always wear their sign: 135 → "+135", "-132" → "-132". */
export function oddsText(v?: number | string | null): string | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace('+', ''), 10);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? `+${n}` : `${n}`;
}

/* ── Prop labels ─────────────────────────────────────────────────────────── */

/**
 * The feed stores raw column tokens ("total_bases 1.5"). Printing those
 * verbatim put "TOTAL_BASES" on the public board — this is the same map the
 * app reads props through, so both surfaces say "Total Bases".
 */
const PROP_LABELS: Record<string, string> = {
  total_bases: 'Total Bases',
  home_runs: 'Home Runs',
  hits: 'Hits',
  hits_runs_rbis: 'H+R+RBI',
  runs_rbis: 'Runs + RBI',
  rbis: 'RBI',
  runs: 'Runs',
  singles: 'Singles',
  doubles: 'Doubles',
  triples: 'Triples',
  walks: 'Walks',
  stolen_bases: 'Stolen Bases',
  strikeouts: 'Strikeouts',
  pitcher_strikeouts: 'Strikeouts',
  batter_strikeouts: 'Strikeouts',
  earned_runs: 'Earned Runs',
  hits_allowed: 'Hits Allowed',
  outs: 'Outs Recorded',
  pitching_outs: 'Outs Recorded',
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  threes: '3-Pointers',
  pra: 'Pts + Reb + Ast',
  shots_on_goal: 'Shots on Goal',
  goals: 'Goals',
  saves: 'Saves',
  passing_yards: 'Passing Yards',
  rushing_yards: 'Rushing Yards',
  receiving_yards: 'Receiving Yards',
  receptions: 'Receptions',
  anytime_td: 'Anytime TD',
};

/** "total_bases 1.5" → "Total Bases". Unknown tokens title-case gracefully. */
export function propLabel(prop?: string | null): string {
  const token = (prop ?? '').replace(/\s[\d.]+$/, '').trim().toLowerCase();
  if (!token) return '';
  if (PROP_LABELS[token]) return PROP_LABELS[token];
  return token
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Separate line wins; older stored markets can encode it as "total_bases 1.5". */
export function propLine(prop: PropPick): string | number | null {
  if (prop.line != null && String(prop.line).trim() !== '') {
    return typeof prop.line === 'string' ? prop.line.trim() : prop.line;
  }
  return (prop.prop ?? '').trim().match(/\s+([+-]?\d+(?:\.\d+)?)$/)?.[1] ?? null;
}

/** "OVER 1.5 Total Bases" — the call as one readable line. */
export function propCall(prop: PropPick): string {
  const side = (prop.bet ?? '').toUpperCase();
  const value = propLine(prop);
  const line = value != null ? ` ${value}` : '';
  const label = propLabel(prop.prop);
  return `${side}${line}${label ? ` ${label}` : ''}`.trim();
}

export function isOverCall(prop: PropPick): boolean {
  const b = (prop.bet ?? '').toLowerCase();
  return b === 'over' || b === 'yes';
}

/* ── The written read ────────────────────────────────────────────────────── */

export interface ScoutSection {
  label?: string;
  body: string;
}

/** Labels the chip already states — printing them again is duplication. */
const REDUNDANT_LABELS = new Set(['THE PICK', 'PICK', 'THE CALL']);

/**
 * Gary writes the prop read as labelled blocks separated by blank lines
 * ("MATCHUP: …", "THE KEY FACTOR: …", "THE RISK: …"). HTML collapses those
 * newlines, which is how the board ended up as one grey wall of text — so the
 * blocks get parsed back out and rendered as a scouting report.
 *
 * Unlabelled prose (the game-pick voice) still splits on its own paragraphs,
 * and a single unbroken blob falls back to ~3-sentence groups, matching the
 * app's `paragraphs()` helper.
 */
export function parseScoutSections(text?: string | null): ScoutSection[] {
  const raw = (text ?? '').replace(/^Gary's Take\s*/i, '').trim();
  if (!raw) return [];

  const blocks = raw.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const source = blocks.length > 1 ? blocks : sentenceGroups(raw);

  const out: ScoutSection[] = [];
  for (const block of source) {
    // "Pick: Mariners ML -131" on its own line restates the chip above it.
    if (/^pick:\s/i.test(block) && block.length < 80) continue;
    const m = block.match(/^([A-Z][A-Z0-9 &/+'’-]{2,40}):\s*([\s\S]+)$/);
    if (m) {
      const label = m[1].trim();
      if (REDUNDANT_LABELS.has(label)) continue;
      out.push({ label, body: m[2].trim() });
    } else {
      out.push({ body: block });
    }
  }
  return out;
}

/** First words of a block, normalized — the fingerprint used to spot a
 *  paragraph the reader has already been shown. */
function opening(body: string): string {
  return body.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 7).join(' ');
}

/**
 * The analysis and the plain read are two tellings of one call, so they often
 * open on the same sentence. Behind the disclosure, drop what the reader just
 * read — repetition is what makes a page feel padded.
 */
export function scoutSectionsExcluding(text?: string | null, already?: string | null): ScoutSection[] {
  const seen = new Set(parseScoutSections(already).map(s => opening(s.body)));
  return parseScoutSections(text).filter(s => !seen.has(opening(s.body)));
}

/**
 * One block to stand in for the whole read — teaser surfaces (home, rails)
 * take the reasoning section, not the matchup boilerplate, and never the raw
 * labelled blob with its "MATCHUP:" running mid-sentence.
 */
export function leadSection(text?: string | null): string | null {
  const sections = parseScoutSections(text);
  if (sections.length === 0) return null;
  const meat = sections.find(s => /KEY FACTOR|WHY|THE CASE|EDGE/i.test(s.label ?? ''));
  return (meat ?? sections[0]).body;
}

/** Port of iOS HomeMarqueeHero.paragraphs: ~3 sentence groups, words untouched. */
function sentenceGroups(text: string): string[] {
  const sentences = text.split('. ');
  if (sentences.length <= 4) return [text];
  const per = Math.ceil(sentences.length / 3);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += per) {
    const chunk = sentences.slice(i, i + per).join('. ').trim();
    out.push(/[.!?]$/.test(chunk) ? chunk : `${chunk}.`);
  }
  return out;
}

/* ── Market ──────────────────────────────────────────────────────────────── */

/**
 * "O/U 8.5 · RL ATL -1.5" — the rest of the board beside Gary's call, worded
 * exactly like the app's hero market row. The run line is printed against the
 * favourite (the side the book laid the 1.5 on), never invented.
 */
export function marketLine(opts: {
  total?: string | number | null;
  spread?: string | number | null;
  mlHome?: string | number | null;
  mlAway?: string | number | null;
  homeAbbr?: string | null;
  awayAbbr?: string | null;
  league?: string | null;
}): string | null {
  const bits: string[] = [];
  const total = opts.total != null && opts.total !== '' ? Number(opts.total) : null;
  if (total != null && Number.isFinite(total)) bits.push(`O/U ${total}`);

  const spread = opts.spread != null && opts.spread !== '' ? Number(opts.spread) : null;
  const home = opts.mlHome != null && opts.mlHome !== '' ? Number(opts.mlHome) : null;
  const away = opts.mlAway != null && opts.mlAway !== '' ? Number(opts.mlAway) : null;
  if (spread != null && Number.isFinite(spread) && home != null && away != null) {
    const favIsHome = home < away;
    const favAbbr = favIsHome ? opts.homeAbbr : opts.awayAbbr;
    const label = (opts.league ?? '').toUpperCase() === 'MLB' ? 'RL' : 'SPREAD';
    if (favAbbr) bits.push(`${label} ${favAbbr} -${Math.abs(spread)}`);
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}
