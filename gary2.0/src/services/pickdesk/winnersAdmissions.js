/** Persist exact published tickets and their original evidence before review. */
import { createHash } from 'node:crypto';
import { pickSideOf } from '../closingLine.js';

export const WINNERS_POLICY_VERSION = 'exact-ticket-v2';
export const WINNERS_CUTOVER_DATE = '2026-09-04';
const norm = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const numeric = v => v == null || String(v).trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export function canonicalProp(p) {
  const text = norm(p.prop || p.prop_type);
  const embedded = text.match(/\s+([+-]?\d+(?:\.\d+)?)$/);
  const displayLine=norm(p.prop).match(/\s+([+-]?\d+(?:\.\d+)?)$/);
  return {
    player: norm(p.player).normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    prop: text.replace(/\s+[+-]?\d+(?:\.\d+)?$/, '').replace(/^player_/, '').replace(/\s+/g, '_'),
    line: numeric(p.line) ?? numeric(embedded?.[1]), side: norm(p.bet),
    conflictingLine: numeric(p.line)!=null && numeric(displayLine?.[1])!=null && numeric(p.line)!==numeric(displayLine[1]),
  };
}
export const coreProp = p => !['HR','TD'].includes(String(p.lane || '').toUpperCase())
  && !/^(home_runs?|homeruns?|batter_home_runs|anytime_td|anytime_touchdown|first_td|first_touchdown)$/.test(canonicalProp(p).prop);

export const isProductionWinnersRun = ({shouldStore=true,useTestTable=false,dryRun=false}={}) => Boolean(shouldStore && !useTestTable && !dryRun);

export function winnersPickIsHome(pick) {
  const side=pickSideOf(pick);
  return side==='home' ? true : side==='away' ? false : null;
}

/** Atomic append may skip an incoming duplicate. Only its actual published
 * decision may receive the evidence gathered for this run. */
export function publishedDecisionMatches(incoming,published,{date,league,kind}) {
  if(!published)return false;
  return winnersCandidate({date,league,kind,pick:incoming}).ticket_key===winnersCandidate({date,league,kind,pick:published}).ticket_key
    && ['rationale','model','prompt_sha'].every(key=>String(incoming[key] ?? '')===String(published[key] ?? ''));
}

export async function confirmedPublishedGame({date,league,pick},{readPublished}) {
  const found=await readPublished(league,date,String(pick.game_id ?? pick.bdl_game_id ?? ''));
  if(found?.error)throw new Error(found.error);
  return publishedDecisionMatches(pick,found?.storedPick,{date,league,kind:'game'}) ? found.storedPick : null;
}

export function winnersCandidate({ date, league, kind, pick, evidence = {} }) {
  const gameId = String(pick.game_id ?? pick.bdl_game_id ?? '').trim();
  const prop = canonicalProp(pick);
  const market = kind === 'game'
    ? [gameId, 'game']
    : [gameId, prop.player, prop.prop, prop.line, prop.side];
  const odds = numeric(pick.odds);
  const pickText = kind === 'game' ? String(pick.pick || '').trim() : `${pick.player || ''} ${prop.side} ${prop.prop} ${prop.line ?? ''} @ ${odds ?? ''}`;
  const time = new Date(pick.commence_time || evidence.commenceTime || '');
  const kickoff = Number.isNaN(time.getTime()) ? null : time.toISOString();
  const invalid = !gameId || !pickText || odds == null || !Number.isInteger(odds) || Math.abs(odds) < 100 || !kickoff
    || (kind === 'prop' && (!prop.player || !prop.prop || prop.line == null || prop.conflictingLine || !['over','under'].includes(prop.side) || !coreProp(pick)));
  return {
    game_date: date, league: league.toUpperCase(), kind, game_id: gameId,
    market_key: digest([date, league.toUpperCase(), ...market]),
    ticket_key: digest([date, league.toUpperCase(), kind, ...(kind === 'prop' ? market : [gameId, norm(pickText)]), odds]),
    pick_text: pickText, odds, commence_time: kickoff,
    pick_snapshot: pick, evidence_snapshot: evidence,
    policy_version: WINNERS_POLICY_VERSION,
    status: invalid ? 'unavailable' : 'pending',
    reason: invalid ? 'Missing exact game identity, ticket price, or kickoff' : null,
  };
}

export async function enqueueWinnersCandidate(client, input) {
  const row = winnersCandidate(input);
  const { error } = await client.from('winners_candidates').upsert(row, { onConflict: 'ticket_key', ignoreDuplicates: true });
  if (error) throw error;
  // Fill a publication/queue gap without overwriting original evidence or an
  // admitted snapshot. A missing-evidence review can still recover before kickoff.
  if (input.evidence?.deskText) {
    const { error: evidenceError } = await client.from('winners_candidates')
      .update({ evidence_snapshot: input.evidence })
      .eq('ticket_key',row.ticket_key).in('status',['pending','unavailable'])
      .is('admitted_at',null).is('evidence_snapshot->>deskText',null);
    if (evidenceError) throw evidenceError;
  }
  // Reconciliation can win the publication race with the original desk but
  // without the later tool responses. Enrich only that same decision, before
  // kickoff, while still unadmitted; never replace a complete envelope.
  if (input.evidence?.snapshotVersion === 2 && Date.parse(input.evidence.observedAt) < Date.parse(row.commence_time)) {
    const found = await client.from('winners_candidates').select('pick_snapshot,evidence_snapshot')
      .eq('ticket_key', row.ticket_key).maybeSingle();
    if (found.error) throw found.error;
    const old = found.data?.evidence_snapshot;
    const sameInputs = old && !old.snapshotVersion && old.deskText === input.evidence.deskText &&
      ['caseHome','caseAway','researchBriefing'].every(key => !old[key] || old[key] === input.evidence[key]) &&
      publishedDecisionMatches(input.pick, found.data.pick_snapshot, input);
    if (sameInputs) {
      const repaired = await client.from('winners_candidates').update({ evidence_snapshot: input.evidence })
        .eq('ticket_key', row.ticket_key).in('status', ['pending', 'unavailable'])
        .gt('commence_time', new Date().toISOString()).is('admitted_at', null)
        .is('evidence_snapshot->>snapshotVersion', null);
      if (repaired.error) throw repaired.error;
    }
  }
  return row;
}

export async function enqueueWinnersProps(client, { date, league, picks, evidenceByGame = {} }) {
  for (const pick of picks.filter(coreProp)) {
    await enqueueWinnersCandidate(client, { date, league, kind:'prop', pick,
      evidence: evidenceByGame[String(pick.game_id ?? pick.bdl_game_id)] || {} });
  }
}
