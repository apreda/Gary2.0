#!/usr/bin/env python3
"""Adam's personal X (@AdamPreda007) over the X API, OAuth 1.0a user context.

Keys live in the macOS Keychain (service "x-personal-adam"), never in this repo.

  python3 xadam.py get  /2/users/me "user.fields=description,public_metrics,url"
  python3 xadam.py json /2/tweets '{"text": "..."}'
  python3 xadam.py form /1.1/account/update_profile.json description=... url=...
"""
import base64, hashlib, hmac, json, secrets, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://api.x.com"


def key(name):
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", "x-personal-adam", "-a", name, "-w"], text=True
    ).strip()


def q(s):
    return urllib.parse.quote(str(s), safe="~")


def auth_header(method, url, params):
    oauth = {
        "oauth_consumer_key": key("consumer_key"),
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": key("access_token"),
        "oauth_version": "1.0",
    }
    pairs = sorted((q(k), q(v)) for k, v in {**params, **oauth}.items())
    base = "&".join([method, q(url), q("&".join(f"{k}={v}" for k, v in pairs))])
    signing_key = f"{q(key('consumer_secret'))}&{q(key('access_secret'))}"
    oauth["oauth_signature"] = base64.b64encode(
        hmac.new(signing_key.encode(), base.encode(), hashlib.sha1).digest()
    ).decode()
    return "OAuth " + ", ".join(f'{q(k)}="{q(v)}"' for k, v in sorted(oauth.items()))


def call(method, path, query=None, form=None, body=None):
    url = API + path
    query = query or {}
    signed = {**query, **(form or {})}  # JSON bodies are not part of the signature
    headers = {"Authorization": auth_header(method, url, signed)}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form, quote_via=urllib.parse.quote).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    full = url + ("?" + urllib.parse.urlencode(query, quote_via=urllib.parse.quote) if query else "")
    req = urllib.request.Request(full, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw.decode(errors="replace")


def kv(args):
    return dict(a.split("=", 1) for a in args if "=" in a)


if __name__ == "__main__":
    mode, path, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    if mode == "get":
        status, out = call("GET", path, query=kv(rest))
    elif mode == "json":
        status, out = call("POST", path, body=json.loads(rest[0]))
    elif mode == "delete":
        status, out = call("DELETE", path)
    elif mode == "form":
        status, out = call("POST", path, form=kv(rest))
    else:
        sys.exit(f"unknown mode {mode}")
    print(status)
    print(json.dumps(out, indent=1) if not isinstance(out, str) else out)
