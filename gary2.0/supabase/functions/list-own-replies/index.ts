import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

async function hmacSha1(key: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/\*/g, "%2A")
    .replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

async function generateOAuthHeader(
  method: string, url: string, params: Record<string, string>,
  consumerKey: string, consumerSecret: string,
  accessToken: string, accessTokenSecret: string
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams).sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join("&");
  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  const encoder = new TextEncoder();
  const signature = await hmacSha1(encoder.encode(signingKey), signatureBase);
  oauthParams.oauth_signature = signature;
  const headerString = Object.keys(oauthParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
  return `OAuth ${headerString}`;
}

// LIST OWN REPLIES (Sep 29 2026): read-only. Every reply @BetwithGary posted
// to another account (its own thread replies excluded), newest first, so the
// founder can choose which to delete with post-delete-tweet. Never deletes.
const SELF_ID = "2001291581446631424";

Deno.serve(async (req: Request) => {
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  try {
    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
    const maxPages = Math.min(Number(new URL(req.url).searchParams.get("pages") ?? 8), 32);
    const base = `https://api.x.com/2/users/${SELF_ID}/tweets`;
    const replies: any[] = [];
    let scanned = 0;
    let token: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, string> = {
        max_results: "100", exclude: "retweets",
        "tweet.fields": "created_at,conversation_id,in_reply_to_user_id,public_metrics",
        expansions: "in_reply_to_user_id", "user.fields": "username",
      };
      if (token) params.pagination_token = token;
      const auth = await generateOAuthHeader("GET", base, params, apiKey, apiSecret, accessToken, accessTokenSecret);
      const r = await fetch(`${base}?${new URLSearchParams(params)}`, { headers: { Authorization: auth } });
      const j = await r.json();
      if (!r.ok) return Response.json({ ok: false, status: r.status, error: j, replies, scanned }, { status: 502 });
      const users = new Map((j.includes?.users ?? []).map((u: any) => [u.id, u.username]));
      for (const t of j.data ?? []) {
        scanned++;
        if (!t.in_reply_to_user_id || t.in_reply_to_user_id === SELF_ID) continue;
        replies.push({ id: t.id, created_at: t.created_at, to: users.get(t.in_reply_to_user_id) ?? t.in_reply_to_user_id,
          conversation_id: t.conversation_id, text: t.text, likes: t.public_metrics?.like_count ?? 0 });
      }
      token = j.meta?.next_token;
      if (!token) break;
    }
    return Response.json({ ok: true, scanned, count: replies.length, replies });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
