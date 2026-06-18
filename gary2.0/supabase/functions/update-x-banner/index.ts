import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// update-x-banner — sets @BetwithGary's profile HEADER/banner via X API v1.1 account/update_profile_banner (OAuth 1.0a).
// Body: { banner_base64: "<base64 of a PNG/JPG>" }. Optional ?dry_run=1 returns the decoded byte size without calling X.
// Uploaded as multipart/form-data (the binary part is NOT included in the OAuth signature base, same as media upload).
// Reuses the exact OAuth 1.0a signer from post-reply-tweet.

async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21").replace(/\*/g, "%2A")
    .replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

async function generateOAuthHeader(method: string, url: string, params: Record<string, string>, consumerKey: string, consumerSecret: string, accessToken: string, accessTokenSecret: string): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams).sort().map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`).join("&");
  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  const encoder = new TextEncoder();
  const signature = await hmacSha1(encoder.encode(signingKey), signatureBase);
  oauthParams.oauth_signature = signature;
  return "OAuth " + Object.keys(oauthParams).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

Deno.serve(async (req: Request) => {
  try {
    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
    const { banner_base64 } = await req.json();
    if (!banner_base64) return Response.json({ error: "missing banner_base64 in body" }, { status: 400 });
    const bytes = Uint8Array.from(atob(banner_base64), (c) => c.charCodeAt(0));
    if (dryRun) return Response.json({ dry_run: true, bytes: bytes.length });

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    const apiUrl = "https://api.twitter.com/1.1/account/update_profile_banner.json";
    // Multipart upload: the OAuth signature base includes ONLY the oauth params (the binary banner is not signed).
    const authHeader = await generateOAuthHeader("POST", apiUrl, {}, apiKey, apiSecret, accessToken, accessTokenSecret);

    const fd = new FormData();
    fd.append("banner", new Blob([bytes], { type: "image/png" }), "banner.png");

    const resp = await fetch(apiUrl, { method: "POST", headers: { Authorization: authHeader }, body: fd });
    const text = await resp.text();
    let body: any; try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 400); }
    // X returns 200/201 with empty body on success.
    return Response.json({ status: resp.status, ok: resp.ok, body }, { status: resp.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
