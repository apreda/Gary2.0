import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// post-tweet-media — like post-tweet-with-image, but supports UP TO 4 images and an optional reply target.
// Body: { text: string, images_base64?: string[], replyToId?: string }
// Returns: { success, tweetId, mediaIds }
// Used by social-auto-post WC mode: a game's pick cards (1-4) post as ONE tweet; the written read posts as a reply.

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

async function generateOAuthHeader(
  method: string, url: string, params: Record<string, string>,
  consumerKey: string, consumerSecret: string, accessToken: string, accessTokenSecret: string,
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
  return "OAuth " + Object.keys(oauthParams).sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`).join(", ");
}

Deno.serve(async (req: Request) => {
  try {
    const { text, images_base64, replyToId } = await req.json();
    const hasImages = Array.isArray(images_base64) && images_base64.filter(Boolean).length > 0;
    // Text is optional when media is attached (X allows a media-only tweet) — that's how the wordless card reply posts.
    if (!text && !hasImages) return Response.json({ error: "Missing 'text' or images" }, { status: 400 });

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    // Step 1: upload each image (v1.1 media/upload), collect media ids (X caps a tweet at 4).
    const images: string[] = Array.isArray(images_base64) ? images_base64.filter(Boolean).slice(0, 4) : [];
    const mediaIds: string[] = [];
    for (const img of images) {
      const mediaUrl = "https://upload.twitter.com/1.1/media/upload.json";
      const mediaAuthHeader = await generateOAuthHeader("POST", mediaUrl, {}, apiKey, apiSecret, accessToken, accessTokenSecret);
      const boundary = "----Boundary" + crypto.randomUUID().replace(/-/g, "");
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${img}\r\n--${boundary}--\r\n`;
      const mediaResponse = await fetch(mediaUrl, {
        method: "POST",
        headers: { Authorization: mediaAuthHeader, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const mediaData = await mediaResponse.json();
      if (!mediaResponse.ok) return Response.json({ error: "Media upload failed", status: mediaResponse.status, details: mediaData }, { status: 500 });
      mediaIds.push(mediaData.media_id_string);
    }

    // Step 2: post the tweet (with media and/or reply target).
    const tweetUrl = "https://api.x.com/2/tweets";
    const tweetAuthHeader = await generateOAuthHeader("POST", tweetUrl, {}, apiKey, apiSecret, accessToken, accessTokenSecret);
    const tweetBody: any = {};
    if (text) tweetBody.text = text;
    if (mediaIds.length) tweetBody.media = { media_ids: mediaIds };
    if (replyToId) tweetBody.reply = { in_reply_to_tweet_id: replyToId };

    const tweetResponse = await fetch(tweetUrl, {
      method: "POST",
      headers: { Authorization: tweetAuthHeader, "Content-Type": "application/json" },
      body: JSON.stringify(tweetBody),
    });
    const tweetData = await tweetResponse.json();
    if (!tweetResponse.ok) return Response.json({ error: "Tweet failed", tweetStatus: tweetResponse.status, details: tweetData, mediaIds }, { status: 500 });

    return Response.json({ success: true, tweetId: tweetData?.data?.id, mediaIds });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
