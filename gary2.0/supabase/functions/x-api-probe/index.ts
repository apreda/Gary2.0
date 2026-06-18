import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// x-api-probe — THROWAWAY read-only diagnostic (Jun 16 2026). Hits X API v2 GET endpoints once each to learn what READ
// access @BetwithGary's developer project actually has: owned mentions, recent search, list reads. Reuses the OAuth 1.0a
// signer from post-reply-tweet, extended for GET (query params MUST go into the signature base string). No writes, no loops.
// Call: GET /functions/v1/x-api-probe (anon key). Optional ?listId=<realListId>. DELETE this function after recording the verdict.

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

function verdictFor(status: number): string {
  if (status === 200) return "OK";
  if (status === 429) return "RATE_LIMITED_access_ok";
  if (status === 403) return "TIER_GATED_no_read";
  if (status === 401) return "AUTH_FAIL";
  if (status === 404 || status === 400) return "REACHABLE_access_ok";
  return "OTHER_" + status;
}
function accessOk(v: string): boolean {
  return v === "OK" || v === "RATE_LIMITED_access_ok" || v === "REACHABLE_access_ok";
}

Deno.serve(async (req: Request) => {
  const creds = {
    apiKey: (Deno.env.get("X_API_KEY") || "").trim(),
    apiSecret: (Deno.env.get("X_API_SECRET") || "").trim(),
    accessToken: (Deno.env.get("X_ACCESS_TOKEN") || "").trim(),
    accessTokenSecret: (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim(),
  };
  const listId = new URL(req.url).searchParams.get("listId") || "1234567890123456789";

  async function signedGet(baseUrl: string, queryParams: Record<string, string>) {
    try {
      const qs = Object.keys(queryParams).sort().map((k) => `${percentEncode(k)}=${percentEncode(queryParams[k])}`).join("&");
      const fullUrl = qs ? `${baseUrl}?${qs}` : baseUrl;
      const authHeader = await generateOAuthHeader("GET", baseUrl, queryParams, creds.apiKey, creds.apiSecret, creds.accessToken, creds.accessTokenSecret);
      const resp = await fetch(fullUrl, { headers: { Authorization: authHeader } });
      const bodyText = await resp.text();
      let body: any; try { body = JSON.parse(bodyText); } catch { body = bodyText; }
      const data = body && body.data;
      return {
        status: resp.status,
        verdict: verdictFor(resp.status),
        accessLevel: resp.headers.get("x-access-level"),
        rateRemaining: resp.headers.get("x-rate-limit-remaining"),
        sampleCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
        error: (body && (body.detail || body.title || (body.errors && JSON.stringify(body.errors).slice(0, 200)))) || (typeof body === "string" ? body.slice(0, 160) : null),
        _data: data,
      };
    } catch (e) {
      return { status: 0, verdict: "FETCH_ERROR", error: String(e), _data: null };
    }
  }

  const self = await signedGet("https://api.x.com/2/users/me", {});
  const userId = self._data && self._data.id;
  const handle = self._data && self._data.username;

  const mentions = userId
    ? await signedGet(`https://api.x.com/2/users/${userId}/mentions`, { max_results: "5" })
    : { status: 0, verdict: "SKIPPED_no_userid", error: "could not resolve own user id from /me", _data: null, sampleCount: 0, accessLevel: null, rateRemaining: null };
  const search = await signedGet("https://api.x.com/2/tweets/search/recent", { query: "from:BetwithGary", max_results: "10" });
  const lists = await signedGet(`https://api.x.com/2/lists/${listId}/tweets`, { max_results: "5" });

  const strip = (o: any) => { const { _data, ...rest } = o; return rest; };

  return Response.json({
    note: "x-api-probe (throwaway, read-only). 403 = no read access on that endpoint; 200/404/429 = access OK. Delete this function after recording the verdict.",
    self: { status: self.status, verdict: self.verdict, userId: userId || null, handle: handle || null, accessLevel: self.accessLevel, error: self.error },
    mentions: strip(mentions),
    search: strip(search),
    lists: { ...strip(lists), listIdTested: listId },
    conclusion: {
      authOK: !!userId,
      ownedReadOK: accessOk(mentions.verdict),
      searchOK: accessOk(search.verdict),
      listOK: accessOk(lists.verdict),
    },
  });
});
