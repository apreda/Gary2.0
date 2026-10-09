#!/usr/bin/env node
// App Store Connect API client for Gary's growth numbers.
// Key file stays outside the repo: ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
//
//   node asc.mjs get /v1/apps/6751238914
//   node asc.mjs post /v1/analyticsReportRequests '{"data": ...}'
//   node asc.mjs raw /v1/salesReports?... > out.gz   (binary body to stdout)
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export const APP_ID = '6751238914';
const KEY_ID = process.env.ASC_KEY_ID || '46JC2TMK4B';
const ISSUER = process.env.ASC_ISSUER_ID || '521830ee-c476-4bdd-8b08-b703cfda627d';
const KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const key = createPrivateKey(readFileSync(KEY_PATH));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

export async function asc(method, path, body) {
  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, path, json] = process.argv.slice(2);
  const res = await asc(mode === 'post' ? 'POST' : 'GET', path, json ? JSON.parse(json) : undefined);
  if (mode === 'raw') {
    process.stderr.write(`${res.status}\n`);
    process.stdout.write(Buffer.from(await res.arrayBuffer()));
  } else {
    console.log(res.status);
    const text = await res.text();
    try { console.log(JSON.stringify(JSON.parse(text), null, 1)); } catch { console.log(text); }
  }
}
