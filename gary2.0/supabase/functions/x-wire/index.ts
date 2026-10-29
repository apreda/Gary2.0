import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// TONIGHT ON X (founder, Oct 29 2026): real people's takes on tonight's games for Home's slideshow, "the reaction
// from the influencers plus the talking heads on TV, but no ESPN, no companies". Reads the chosen accounts' NEW
// posts with Gary's X keys (paid per post read, so since_id and a daily cap), keeps the ones that name a game on
// the slate and read as a take, not news or a promotion, and stores them for get_x_wire. The app embeds each post
// with X's own widget.
//
//   POST {}                                   one pass (the 20-minute cron)
//   POST {"resolve": ["handle", ...]}         look the accounts up and add them (paid per user read)
//   POST {"lookback": 8}                      one pass over the last N hours instead of only new posts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** Post reads a day before the function stops for the day ($0.005 each at X's pay-per-use rate). */
const DAILY_POST_CAP = 600;

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

async function bumpReads(day: string, posts: number, users: number, pass: boolean) {
  const cur: any[] = await db(`x_wire_reads?select=posts,users,passes&day=eq.${day}`);
  const row = cur?.[0] ?? { posts: 0, users: 0, passes: 0 };
  await db("x_wire_reads", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ day, posts: row.posts + posts, users: row.users + users, passes: row.passes + (pass ? 1 : 0) }),
  });
}

async function resolve(handles: string[]) {
  const url = "https://api.x.com/2/users/by";
  const found: any[] = [];
  const missing: any[] = [];
  for (let i = 0; i < handles.length; i += 100) {
    const r = await xGet(url, { usernames: handles.slice(i, i + 100).join(","), "user.fields": "public_metrics,description,verified,name" });
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
      }))),
    });
  }
  await bumpReads(slateDay(), 0, found.length, false);
  return { ok: true, found: found.map((u) => ({ username: u.username, name: u.name, followers: u.public_metrics?.followers_count, description: u.description })), missing };
}

async function pass(lookback?: number) {
  const day = slateDay();
  const { hour } = etParts();
  // Takes on the night's games come from late morning to the last final; nothing is read overnight.
  if (hour >= 2 && hour < 11) return { ok: true, skipped: "overnight" };
  const reads: any[] = await db(`x_wire_reads?select=posts&day=eq.${day}`);
  if ((reads?.[0]?.posts ?? 0) >= DAILY_POST_CAP) return { ok: true, skipped: "daily cap" };

  const games = await slateGames(day);
  if (!games.length) return { ok: true, skipped: "no games" };
  const accounts: any[] = await db("x_wire_accounts?select=username,user_id,since_id&active=eq.true&user_id=not.is.null");

  let read = 0;
  const keep: any[] = [];
  const errors: any[] = [];
  for (const a of accounts) {
    const url = `https://api.x.com/2/users/${a.user_id}/tweets`;
    const params: Record<string, string> = {
      max_results: "10", exclude: "replies,retweets", "tweet.fields": "created_at,public_metrics,lang",
    };
    if (a.since_id && !lookback) params.since_id = a.since_id;
    else params.start_time = new Date(Date.now() - Math.min(lookback ?? 3, 12) * 3600_000).toISOString();
    const r = await xGet(url, params);
    if (!r.ok) { errors.push({ username: a.username, status: r.status, error: r.body?.title ?? r.body }); continue; }
    const posts: any[] = r.body.data ?? [];
    read += posts.length;
    if (r.body.meta?.newest_id) {
      await db(`x_wire_accounts?username=eq.${encodeURIComponent(a.username)}`, { method: "PATCH", body: JSON.stringify({ since_id: r.body.meta.newest_id }) });
    }
    for (const p of posts) {
      const text = String(p.text ?? "");
      if (p.lang && p.lang !== "en") continue;
      if (NEWS.test(text) || PROMO.test(text) || POLITICS.test(text)) continue;
      if (text.replace(/https?:\/\/\S+/g, "").trim().length < 25) continue;
      const hits = games.filter((g) => g.terms.some((t) => mentions(text, t)));
      if (!hits.length) continue;
      const g = hits.find((h) => h.big) ?? hits[0];
      keep.push({
        id: p.id, username: a.username, posted_at: p.created_at, slate_date: day, league: g.league, matchup: g.matchup,
        big_game: g.big, likes: p.public_metrics?.like_count ?? 0, reposts: p.public_metrics?.retweet_count ?? 0, text,
      });
    }
    if (read >= DAILY_POST_CAP) break;
  }
  if (keep.length) {
    await db("x_wire_posts", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(keep) });
  }
  await bumpReads(day, read, 0, true);
  return { ok: true, day, accounts: accounts.length, read, kept: keep.length, errors };
}

Deno.serve(async (req: Request) => {
  if (!isSocialServiceRequest(req, SERVICE_KEY)) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.resolve)) return Response.json(await resolve(body.resolve.map(String)));
    return Response.json(await pass(Number(body?.lookback) || undefined));
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
