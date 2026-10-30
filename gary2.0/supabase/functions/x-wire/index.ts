import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// TONIGHT ON X (founder, Oct 29 2026): real people's takes on tonight's games for Home's slideshow, "the reaction
// from the influencers plus the talking heads on TV, but no ESPN, no companies". X bills every post read, and the
// founder's ceiling is "5 dollar a month or 9 max", so a pass is one recent search per handful of accounts that
// asks only for their posts naming tonight's teams; nothing else is read or paid for. It keeps the ones that read
// as a take (not news, a promotion or politics) and stores what the app draws: clean text and the first photo.
//
//   POST {}                                   one pass (the 20-minute cron)
//   POST {"resolve": ["handle", ...]}         look the accounts up: name, picture, check ($0.01 a person)
//   POST {"hydrate": true}                    re-read today's stored posts that lack text or media

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** Post reads before the function stops ($0.005 each at X's pay-per-use rate): $0.25 a day, $7.50 a month. */
const DAILY_POST_CAP = 50;
const MONTHLY_POST_CAP = 1500;
/** Accounts per search, so each query stays inside X's 512-character limit with tonight's teams. */
const ACCOUNTS_PER_QUERY = 8;

async function hmacSha1(key: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/\*/g, "%2A")
    .replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

async function oauthHeader(method: string, url: string, params: Record<string, string>): Promise<string> {
  const consumerKey = (Deno.env.get("X_API_KEY") || "").trim();
  const consumerSecret = (Deno.env.get("X_API_SECRET") || "").trim();
  const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
  const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauthParams };
  const sorted = Object.keys(all).sort().map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  oauthParams.oauth_signature = await hmacSha1(new TextEncoder().encode(signingKey), base);
  return "OAuth " + Object.keys(oauthParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

async function xGet(url: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; body: any }> {
  const r = await fetch(`${url}?${new URLSearchParams(params)}`, { headers: { Authorization: await oauthHeader("GET", url, params) } });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

async function db(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

/** The app's slate day: the ET date, held on the night before until 5 a.m. */
function etParts(now = new Date()): { date: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
function slateDay(now = new Date()): string {
  const { date, hour } = etParts(now);
  if (hour >= 5) return date;
  return etParts(new Date(now.getTime() - 6 * 3600_000)).date;
}

// Short names fans actually type, beside each club's own nickname.
const ALIASES: Record<string, string[]> = {
  "76ers": ["Sixers"], "Cavaliers": ["Cavs"], "Mavericks": ["Mavs"], "Timberwolves": ["Wolves", "T-Wolves"],
  "Pelicans": ["Pels"], "Trail Blazers": ["Blazers"], "Grizzlies": ["Grizz"], "Warriors": ["Dubs"],
  "49ers": ["Niners"], "Buccaneers": ["Bucs"], "Commanders": ["Commies"],
};
const MULTI = ["Trail Blazers", "Red Sox", "White Sox", "Blue Jays", "Maple Leafs", "Golden Knights", "Red Wings", "Blue Jackets"];

/** How a team is named in a post. The full name matches in any case; a nickname or short name only as a proper
 * noun ("the Wild", never "this is wild"). A college's school name ("Ohio State") counts; a pro city alone never
 * does ("The New York Times" is not the Islanders). */
function teamTerms(team: string, league: string): { term: string; anyCase: boolean }[] {
  const multi = MULTI.find((m) => team.endsWith(m));
  const nick = multi ?? team.split(" ").slice(-1)[0];
  const place = team.slice(0, team.length - nick.length).trim();
  const terms = [{ term: team, anyCase: true }, { term: nick, anyCase: false },
                 ...(ALIASES[nick] ?? []).map((a) => ({ term: a, anyCase: false }))];
  if (place && league.startsWith("NCAA")) terms.push({ term: place, anyCase: false });
  return terms.filter((t) => t.term.length >= 3);
}
function mentions(text: string, t: { term: string; anyCase: boolean }): boolean {
  const esc = t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, t.anyCase ? "i" : "").test(text);
}

// A take, not a bulletin or an ad (founder: "What I don't want is ESPN style, like 'Oh, this person's injured'").
const NEWS = /(^|\s)(BREAKING|Sources?:|INJURY|UPDATE:)|\b(ruled out|is questionable|is doubtful|will not play|won't play|listed as|per sources?|injury report|inactive|has been (placed|activated|waived|traded|signed|released))\b/i;
const POLITICS = /\b(Democrats?|Republicans?|GOP|Trump|Biden|Harris|Vance|Senat(e|or)|Congress|election|ballot|voters?|liberals?|conservatives?|woke)\b/i;
const PROMO = /\b(promo|code|deposit|bonus|sign ?up|giveaway|link in (my )?bio|DM me|discord\.gg|whop\.com|subscribe|use my link|odds boost|boosted|free bet|tail me|VIP)\b/i;

type Game = { league: string; matchup: string; big: boolean; terms: { term: string; anyCase: boolean }[] };

async function slateGames(date: string): Promise<Game[]> {
  const rows: any[] = await db(`daily_slate?select=league,away_team,home_team&date=eq.${date}`);
  const board: any[] = await db(`tomorrow_board?select=big_games&date=eq.${date}`);
  const bigs = new Set(((board?.[0]?.big_games ?? []) as any[]).map((b) => String(b.matchup ?? "").toLowerCase()));
  return rows.filter((r) => r.away_team && r.home_team).map((r) => {
    const matchup = `${r.away_team} @ ${r.home_team}`;
    const league = String(r.league ?? "").toUpperCase();
    return { league, matchup, big: bigs.has(matchup.toLowerCase()),
             terms: [...teamTerms(r.away_team, league), ...teamTerms(r.home_team, league)] };
  });
}

async function bumpReads(day: string, posts: number, users: number, pass: boolean, sinceId?: string | null) {
  const cur: any[] = await db(`x_wire_reads?select=posts,users,passes,since_id&day=eq.${day}`);
  const row = cur?.[0] ?? { posts: 0, users: 0, passes: 0, since_id: null };
  await db("x_wire_reads", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ day, posts: row.posts + posts, users: row.users + users, passes: row.passes + (pass ? 1 : 0),
                           since_id: sinceId ?? row.since_id }),
  });
}

async function resolve(handles: string[]) {
  const url = "https://api.x.com/2/users/by";
  const found: any[] = [];
  const missing: any[] = [];
  for (let i = 0; i < handles.length; i += 100) {
    const r = await xGet(url, { usernames: handles.slice(i, i + 100).join(","), "user.fields": "public_metrics,description,verified,verified_type,name,profile_image_url" });
    if (!r.ok) return { ok: false, status: r.status, error: r.body };
    found.push(...(r.body.data ?? []));
    missing.push(...(r.body.errors ?? []).map((e: any) => e.value ?? e.detail));
  }
  if (found.length) {
    await db("x_wire_accounts", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(found.map((u) => ({
        username: u.username, user_id: u.id, name: u.name, followers: u.public_metrics?.followers_count ?? 0,
        description: u.description ?? null, resolved_at: new Date().toISOString(),
        avatar_url: u.profile_image_url ? String(u.profile_image_url).replace("_normal.", "_400x400.") : null,
        verified_type: u.verified_type ?? (u.verified ? "blue" : null),
      }))),
    });
  }
  await bumpReads(slateDay(), 0, found.length, false);
  return { ok: true, found: found.map((u) => ({ username: u.username, name: u.name, followers: u.public_metrics?.followers_count, description: u.description })), missing };
}

/** The post as the app shows it: entities decoded, the photo's own link dropped, other links shown as written. */
function cleanText(p: any): string {
  let text = String(p.note_tweet?.text ?? p.text ?? "");
  for (const u of (p.entities?.urls ?? []) as any[]) {
    // A photo's own link, or a link to another post (a quote, drawn by X as a card the app does not draw), goes.
    const isMedia = typeof u.media_key === "string" || /\/(photo|video)\/\d+$/.test(String(u.expanded_url ?? ""))
      || /^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\//.test(String(u.expanded_url ?? ""));
    // A link reads as its site ("actionnetwork.com"): X's display_url ends in "…", and the app never shows one.
    let site = "";
    try { site = new URL(String(u.expanded_url ?? u.url)).hostname.replace(/^www\./, ""); } catch { site = ""; }
    text = text.split(u.url).join(isMedia ? "" : site);
  }
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+\n/g, "\n").trim();
}

function firstMedia(p: any, media: Map<string, any>): any {
  const key = (p.attachments?.media_keys ?? [])[0];
  const m = key ? media.get(key) : null;
  if (!m) return null;
  const url = m.type === "photo" ? m.url : m.preview_image_url;
  return url ? { type: m.type, url, width: m.width ?? null, height: m.height ?? null } : null;
}

const POST_FIELDS = {
  "tweet.fields": "created_at,public_metrics,lang,entities,attachments,note_tweet,author_id",
  expansions: "attachments.media_keys",
  "media.fields": "type,url,preview_image_url,width,height",
};

/** Keep a post when it names a game and reads as a take; nil otherwise. */
function keepPost(p: any, username: string, day: string, games: Game[], media: Map<string, any>): any | null {
  const raw = String(p.text ?? "");
  if (p.lang && p.lang !== "en") return null;
  if (NEWS.test(raw) || PROMO.test(raw) || POLITICS.test(raw)) return null;
  const text = cleanText(p);
  // A post that runs past a phone screen is an essay, not a take on the game.
  if (text.length < 25 || text.length > 300) return null;
  const hits = games.filter((g) => g.terms.some((t) => mentions(text, t)));
  if (!hits.length) return null;
  const g = hits.find((h) => h.big) ?? hits[0];
  return {
    id: p.id, username, posted_at: p.created_at, slate_date: day, league: g.league, matchup: g.matchup, big_game: g.big,
    likes: p.public_metrics?.like_count ?? 0, reposts: p.public_metrics?.retweet_count ?? 0,
    replies: p.public_metrics?.reply_count ?? 0, text: raw, display_text: text, media: firstMedia(p, media),
  };
}

async function readsSoFar(day: string): Promise<{ today: number; month: number; since_id: string | null }> {
  const month = day.slice(0, 7);
  const rows: any[] = await db(`x_wire_reads?select=day,posts,since_id&day=gte.${month}-01&day=lte.${day}`);
  const today = rows.find((r) => r.day === day);
  return { today: today?.posts ?? 0, month: rows.reduce((n, r) => n + (r.posts ?? 0), 0), since_id: today?.since_id ?? null };
}

async function pass() {
  const day = slateDay();
  const { hour } = etParts();
  // Takes on the night's games come from late morning to the last final; nothing is read overnight.
  if (hour >= 2 && hour < 11) return { ok: true, skipped: "overnight" };
  const spent = await readsSoFar(day);
  if (spent.today >= DAILY_POST_CAP || spent.month >= MONTHLY_POST_CAP) return { ok: true, skipped: "budget", spent };

  const games = await slateGames(day);
  if (!games.length) return { ok: true, skipped: "no games" };
  // The search names tonight's teams by nickname, big games first, inside the query limit.
  const nicknames: string[] = [];
  for (const g of [...games.filter((g) => g.big), ...games.filter((g) => !g.big)]) {
    for (const t of g.terms.filter((t) => !t.anyCase)) if (!nicknames.includes(t.term)) nicknames.push(t.term);
  }
  const accounts: any[] = await db("x_wire_accounts?select=username&active=eq.true&user_id=not.is.null&order=followers.desc");
  const url = "https://api.x.com/2/tweets/search/recent";
  let read = 0, newest = spent.since_id;
  const keep: any[] = [];
  const errors: any[] = [];
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_QUERY) {
    if (spent.today + read >= DAILY_POST_CAP) break;
    const from = accounts.slice(i, i + ACCOUNTS_PER_QUERY).map((a) => `from:${a.username}`).join(" OR ");
    const tail = " -is:retweet -is:reply lang:en";
    const teams: string[] = [];
    for (const n of nicknames) {
      const term = n.includes(" ") ? `"${n}"` : n;
      if (`(${from}) (${[...teams, term].join(" OR ")})${tail}`.length > 500) break;
      teams.push(term);
    }
    const params: Record<string, string> = {
      query: `(${from}) (${teams.join(" OR ")})${tail}`,
      max_results: "10", ...POST_FIELDS,
    };
    if (spent.since_id) params.since_id = spent.since_id;
    else params.start_time = new Date(Date.now() - 3 * 3600_000).toISOString();
    const r = await xGet(url, params);
    if (!r.ok) { errors.push({ status: r.status, error: r.body?.title ?? r.body }); continue; }
    const posts: any[] = r.body.data ?? [];
    read += posts.length;
    const media = new Map(((r.body.includes?.media ?? []) as any[]).map((m) => [m.media_key, m]));
    const byId = new Map(((r.body.includes?.users ?? []) as any[]).map((u) => [u.id, u.username]));
    const handles = new Map(accounts.map((a) => [String(a.username).toLowerCase(), a.username]));
    for (const p of posts) {
      // The author is whichever from: the post answered; X returns author_id, matched back through the account table.
      const author = byId.get(p.author_id) ?? (await authorFor(p.author_id));
      const username = author ? handles.get(String(author).toLowerCase()) : null;
      if (!username) continue;
      const k = keepPost(p, username, day, games, media);
      if (k) keep.push(k);
      if (!newest || BigInt(p.id) > BigInt(newest)) newest = p.id;
    }
  }
  if (keep.length) {
    await db("x_wire_posts", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(keep) });
  }
  await bumpReads(day, read, 0, true, newest);
  return { ok: true, day, read, kept: keep.length, errors, spent: { today: spent.today + read, month: spent.month + read } };
}

const authorCache = new Map<string, string | null>();
/** author_id → username from our own account table (no paid user read). */
async function authorFor(id: string): Promise<string | null> {
  if (authorCache.has(id)) return authorCache.get(id)!;
  const rows: any[] = await db(`x_wire_accounts?select=username&user_id=eq.${encodeURIComponent(id)}`);
  const u = rows?.[0]?.username ?? null;
  authorCache.set(id, u);
  return u;
}

/** Re-read today's stored posts that the app cannot draw yet (written before text and media were kept). */
async function hydrate() {
  const day = slateDay();
  const rows: any[] = await db(`x_wire_posts?select=id,username&slate_date=eq.${day}&display_text=is.null`);
  if (!rows.length) return { ok: true, hydrated: 0 };
  const games = await slateGames(day);
  const r = await xGet("https://api.x.com/2/tweets", { ids: rows.slice(0, 100).map((x) => x.id).join(","), ...POST_FIELDS });
  if (!r.ok) return { ok: false, status: r.status, error: r.body };
  const media = new Map(((r.body.includes?.media ?? []) as any[]).map((m) => [m.media_key, m]));
  const owner = new Map(rows.map((x) => [x.id, x.username]));
  const keep: any[] = [];
  const drop: string[] = [];
  for (const p of (r.body.data ?? []) as any[]) {
    const k = keepPost(p, owner.get(p.id), day, games, media);
    if (k) keep.push(k); else drop.push(p.id);
  }
  if (keep.length) await db("x_wire_posts", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(keep) });
  if (drop.length) await db(`x_wire_posts?id=in.(${drop.join(",")})`, { method: "DELETE" });
  await bumpReads(day, (r.body.data ?? []).length, 0, false);
  return { ok: true, hydrated: keep.length, dropped: drop.length };
}

Deno.serve(async (req: Request) => {
  if (!isSocialServiceRequest(req, SERVICE_KEY)) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.resolve)) return Response.json(await resolve(body.resolve.map(String)));
    if (body?.hydrate) return Response.json(await hydrate());
    return Response.json(await pass());
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
