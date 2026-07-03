import "jsr:@supabase/functions-js/edge-runtime.d.ts";

async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
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

Deno.serve(async (req: Request) => {
  try {
    let tweetIds: string[] = [];

    if (req.method === "GET") {
      const url = new URL(req.url);
      const idsParam = url.searchParams.get("ids") || url.searchParams.get("id");
      if (idsParam) tweetIds = idsParam.split(",").map(s => s.trim()).filter(Boolean);
    } else {
      const body = await req.json();
      if (Array.isArray(body.tweetIds)) tweetIds = body.tweetIds.map(String);
      else if (body.tweetId) tweetIds = [String(body.tweetId)];
      else if (body.id) tweetIds = [String(body.id)];
      else if (Array.isArray(body.ids)) tweetIds = body.ids.map(String);
    }

    if (tweetIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide tweet IDs via JSON body { tweetIds: [...] } or { tweetId: '...' }, or query param ?ids=id1,id2" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (tweetIds.length > 100) {
      return new Response(
        JSON.stringify({ error: "Max 100 tweet IDs per request" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    const baseUrl = "https://api.x.com/2/tweets";
    const queryParams: Record<string, string> = {
      ids: tweetIds.join(","),
      "tweet.fields": "public_metrics,non_public_metrics,organic_metrics,created_at",
    };

    const authHeader = await generateOAuthHeader(
      "GET", baseUrl, queryParams,
      apiKey, apiSecret, accessToken, accessTokenSecret
    );

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const fullUrl = `${baseUrl}?${queryString}`;

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "X API error", status: response.status, details: data }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prefer public_metrics.impression_count (more reliable, includes all sources)
    // Fall back to non_public_metrics or organic_metrics if missing
    const tweets = (data.data || []).map((t: any) => {
      const pm = t.public_metrics || {};
      const npm = t.non_public_metrics || {};
      const om = t.organic_metrics || {};
      const impressions = pm.impression_count ?? npm.impression_count ?? om.impression_count ?? 0;
      return {
        id: t.id,
        created_at: t.created_at,
        impressions,
        likes: pm.like_count ?? om.like_count ?? 0,
        replies: pm.reply_count ?? 0,
        retweets: pm.retweet_count ?? om.retweet_count ?? 0,
        quotes: pm.quote_count ?? 0,
        bookmarks: pm.bookmark_count ?? 0,
        url_link_clicks: om.url_link_clicks ?? null,
        user_profile_clicks: om.user_profile_clicks ?? npm.user_profile_clicks ?? 0,
        engagements: npm.engagements ?? null,
      };
    });

    const totalImpressions = tweets.reduce((s: number, t: any) => s + (t.impressions || 0), 0);
    const totalLikes = tweets.reduce((s: number, t: any) => s + (t.likes || 0), 0);
    const totalReplies = tweets.reduce((s: number, t: any) => s + (t.replies || 0), 0);
    const totalProfileClicks = tweets.reduce((s: number, t: any) => s + (t.user_profile_clicks || 0), 0);

    return new Response(JSON.stringify({
      success: true,
      count: tweets.length,
      totals: {
        impressions: totalImpressions,
        likes: totalLikes,
        replies: totalReplies,
        profile_clicks: totalProfileClicks,
      },
      tweets,
      errors: data.errors || null,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
