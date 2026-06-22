import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// post-delete-tweet — delete a tweet by id (v2 DELETE /2/tweets/:id, OAuth1.0a). Used to clean up smoke-test posts.
// Body: { tweetId: string }  →  { success, deleted }
async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function pct(s: string): string {
  return encodeURIComponent(s).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
async function oauth(method: string, url: string, k: string, ks: string, t: string, ts: string): Promise<string> {
  const p: Record<string, string> = {
    oauth_consumer_key: k, oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: t, oauth_version: "1.0",
  };
  const base = `${method}&${pct(url)}&${pct(Object.keys(p).sort().map((x) => `${pct(x)}=${pct(p[x])}`).join("&"))}`;
  p.oauth_signature = await hmacSha1(new TextEncoder().encode(`${pct(ks)}&${pct(ts)}`), base);
  return "OAuth " + Object.keys(p).sort().map((x) => `${pct(x)}="${pct(p[x])}"`).join(", ");
}

Deno.serve(async (req: Request) => {
  try {
    const { tweetId } = await req.json();
    if (!tweetId) return Response.json({ error: "Missing 'tweetId'" }, { status: 400 });
    const url = `https://api.x.com/2/tweets/${tweetId}`;
    const auth = await oauth("DELETE", url,
      (Deno.env.get("X_API_KEY") || "").trim(), (Deno.env.get("X_API_SECRET") || "").trim(),
      (Deno.env.get("X_ACCESS_TOKEN") || "").trim(), (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim());
    const r = await fetch(url, { method: "DELETE", headers: { Authorization: auth } });
    const j = await r.json();
    if (!r.ok) return Response.json({ error: "Delete failed", status: r.status, details: j }, { status: 500 });
    return Response.json({ success: true, deleted: j?.data?.deleted ?? null, tweetId });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
