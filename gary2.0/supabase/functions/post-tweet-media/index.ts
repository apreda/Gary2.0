import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// post-tweet-media — like post-tweet-with-image, but supports UP TO 4 images and an optional reply target.
// Body: { text: string, images_base64?: string[], replyToId?: string, video_path?: string, upload_only?: boolean }
// Returns: { success, tweetId, mediaIds }
// video_path (Oct 1 2026): an mp4 in the private `social-media` bucket (the daily free pick video). It goes up
// through X's chunked upload (INIT / APPEND / FINALIZE, then STATUS until processed) and posts as the tweet's media.
// upload_only uploads and processes the media without posting, so the path can be verified against X.
// Used by social-auto-post WC mode: a game's pick cards (1-4) post as ONE tweet; the written read posts as a reply.

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

const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

type XKeys = { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string };

async function uploadCall(keys: XKeys, method: "POST" | "GET", params: Record<string, string>, body?: BodyInit): Promise<Response> {
  const auth = await generateOAuthHeader(method, UPLOAD_URL, params, keys.apiKey, keys.apiSecret, keys.accessToken, keys.accessTokenSecret);
  return fetch(`${UPLOAD_URL}?${new URLSearchParams(params)}`, { method, headers: { Authorization: auth }, body });
}

/** X's chunked video upload; resolves once X has finished processing the video. */
async function uploadVideo(keys: XKeys, bytes: Uint8Array): Promise<string> {
  const init = await uploadCall(keys, "POST", { command: "INIT", total_bytes: String(bytes.length), media_type: "video/mp4", media_category: "tweet_video" });
  const initData = await init.json();
  if (!init.ok || !initData.media_id_string) throw new Error(`video INIT failed ${init.status}: ${JSON.stringify(initData).slice(0, 300)}`);
  const mediaId: string = initData.media_id_string;
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const form = new FormData();
    form.append("media", new Blob([bytes.slice(i, i + CHUNK)], { type: "application/octet-stream" }));
    const app = await uploadCall(keys, "POST", { command: "APPEND", media_id: mediaId, segment_index: String(seg) }, form);
    if (!app.ok) throw new Error(`video APPEND ${seg} failed ${app.status}: ${(await app.text()).slice(0, 300)}`);
    await app.body?.cancel();
  }
  const fin = await uploadCall(keys, "POST", { command: "FINALIZE", media_id: mediaId });
  const finData = await fin.json();
  if (!fin.ok) throw new Error(`video FINALIZE failed ${fin.status}: ${JSON.stringify(finData).slice(0, 300)}`);
  let info = finData.processing_info;
  for (let tries = 0; info && (info.state === "pending" || info.state === "in_progress") && tries < 40; tries++) {
    await new Promise((r) => setTimeout(r, Math.min(10, Math.max(1, Number(info.check_after_secs) || 2)) * 1000));
    const st = await uploadCall(keys, "GET", { command: "STATUS", media_id: mediaId });
    const stData = await st.json();
    if (!st.ok) throw new Error(`video STATUS failed ${st.status}: ${JSON.stringify(stData).slice(0, 300)}`);
    info = stData.processing_info;
  }
  if (info && info.state !== "succeeded") throw new Error(`video processing ${info.state}: ${JSON.stringify(info.error ?? info).slice(0, 300)}`);
  return mediaId;
}

Deno.serve(async (req: Request) => {
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  try {
    const { text, images_base64, replyToId, video_path, upload_only } = await req.json();
    const hasImages = Array.isArray(images_base64) && images_base64.filter(Boolean).length > 0;
    const hasVideo = typeof video_path === "string" && video_path.length > 0;
    // Text is optional when media is attached (X allows a media-only tweet) — that's how the wordless card reply posts.
    if (!text && !hasImages && !hasVideo) return Response.json({ error: "Missing 'text', images or video" }, { status: 400 });

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    const mediaIds: string[] = [];
    if (hasVideo) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: blob, error: dlErr } = await sb.storage.from("social-media").download(video_path);
      if (dlErr || !blob) return Response.json({ error: `Video download failed: ${dlErr?.message ?? "empty"}` }, { status: 500 });
      try {
        mediaIds.push(await uploadVideo({ apiKey, apiSecret, accessToken, accessTokenSecret }, new Uint8Array(await blob.arrayBuffer())));
      } catch (e) {
        return Response.json({ error: "Video upload failed", details: String(e) }, { status: 500 });
      }
      if (upload_only) return Response.json({ success: true, uploadOnly: true, mediaIds });
    }

    // Step 1: upload each image (v1.1 media/upload), collect media ids (X caps a tweet at 4).
    const images: string[] = hasVideo ? [] : Array.isArray(images_base64) ? images_base64.filter(Boolean).slice(0, 4) : [];
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
