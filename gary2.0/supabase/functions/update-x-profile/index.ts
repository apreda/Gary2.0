import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// update-x-profile — sets @BetwithGary's profile bio via X API v1.1 account/update_profile (OAuth 1.0a).
// Body: { description: string } (X's limit is 160 characters). Optional ?dry_run=1 validates without calling X.
// Only the bio: name, website and location stay as they are. Form-encoded, so the bio is part of the signature.

async function hmacSha1(key: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
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
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  try {
    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
    const { description } = await req.json();
    if (typeof description !== "string" || !description.trim()) return Response.json({ error: "missing description" }, { status: 400 });
    if ([...description].length > 160) return Response.json({ error: `description is ${[...description].length} characters; X allows 160` }, { status: 400 });
    if (dryRun) return Response.json({ dry_run: true, length: [...description].length });

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    const apiUrl = "https://api.twitter.com/1.1/account/update_profile.json";
    const params = { description, skip_status: "true" };
    const authHeader = await generateOAuthHeader("POST", apiUrl, params, apiKey, apiSecret, accessToken, accessTokenSecret);
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
      body: Object.entries(params).map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&"),
    });
    const text = await resp.text();
    let body: any; try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 400); }
    return Response.json({ status: resp.status, ok: resp.ok, description: body?.description ?? null, error: resp.ok ? null : body },
      { status: resp.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
