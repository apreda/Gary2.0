// reply-engine-send — posts APPROVED reply_queue rows (Jun 18 2026). Only ever posts rows a human set to status='approved'.
// Enforces daily_cap, per_account_cap, and spacing_minutes (from reply_engine_config). Posts the oldest approved first,
// default 1 per invocation (so spacing is naturally enforced by how often it's called). Marks each sent/error. If a post
// hits the account-level reply block (403), it stops and flags it. ?dry_run=1 = show what it WOULD post. ?batch=N overrides.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const sb = createClient(SB_URL, SERVICE_KEY);

function utcDayStart(): string { return new Date().toISOString().slice(0, 10) + "T00:00:00Z"; }

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const batch = parseInt(url.searchParams.get("batch") || "1", 10);

    const { data: cfg } = await sb.from("reply_engine_config").select("*").eq("id", 1).single();
    const dailyCap = cfg?.daily_cap ?? 10;
    const perAccountCap = cfg?.per_account_cap ?? 1;
    const spacingMin = cfg?.spacing_minutes ?? 7;

    // Today's already-sent: count (daily cap), per-author tally, and last-send time (spacing).
    const { data: sentToday } = await sb.from("reply_queue").select("target_author, sent_at").eq("status", "sent").gte("sent_at", utcDayStart());
    const sentCount = (sentToday ?? []).length;
    if (sentCount >= dailyCap) return Response.json({ posted: 0, reason: `daily cap ${dailyCap} reached`, sent_today: sentCount });
    const perAuthor: Record<string, number> = {};
    let lastSent = 0;
    for (const r of sentToday ?? []) {
      if (r.target_author) perAuthor[r.target_author] = (perAuthor[r.target_author] || 0) + 1;
      if (r.sent_at) lastSent = Math.max(lastSent, new Date(r.sent_at).getTime());
    }
    if (!dryRun && lastSent && Date.now() - lastSent < spacingMin * 60_000) {
      return Response.json({ posted: 0, reason: `spacing: last send ${Math.round((Date.now() - lastSent) / 60_000)}m ago, need ${spacingMin}m apart` });
    }

    const { data: approved } = await sb.from("reply_queue").select("*").eq("status", "approved").order("created_at", { ascending: true }).limit(50);
    const out: any[] = [];
    let posted = 0;
    const limit = Math.min(batch, dailyCap - sentCount);
    for (const row of approved ?? []) {
      if (posted >= limit) break;
      if (row.target_author && (perAuthor[row.target_author] || 0) >= perAccountCap) { out.push({ id: row.id, skipped: `per-account cap (${row.target_author})` }); continue; }
      if (dryRun) { out.push({ id: row.id, would_reply_to: row.target_tweet_id, author: row.target_author, draft: row.draft }); posted++; continue; }

      const pr = await fetch(`${SB_URL}/functions/v1/post-reply-tweet`, { method: "POST", headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: row.draft, replyToId: row.target_tweet_id }) });
      const pj = await pr.json();
      if (pj.success && pj.tweetId) {
        await sb.from("reply_queue").update({ status: "sent", posted_tweet_id: pj.tweetId, sent_at: new Date().toISOString() }).eq("id", row.id);
        out.push({ id: row.id, posted: pj.tweetId, url: `https://x.com/BetwithGary/status/${pj.tweetId}` });
        perAuthor[row.target_author] = (perAuthor[row.target_author] || 0) + 1;
        posted++;
      } else {
        const err = JSON.stringify(pj).slice(0, 240);
        await sb.from("reply_queue").update({ status: "error", error: err }).eq("id", row.id);
        out.push({ id: row.id, error: err });
        if (/Forbidden|not been mentioned|403/.test(err)) { out.push({ note: "ACCOUNT REPLY BLOCK hit — stopping. Gary still can't reply here." }); break; }
      }
    }
    return Response.json({ posted, dry_run: dryRun, sent_today: sentCount, daily_cap: dailyCap, results: out });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
