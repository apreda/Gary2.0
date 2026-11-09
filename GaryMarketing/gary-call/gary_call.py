#!/usr/bin/env python3
"""GARY'S CALL (Nov 9 2026, the social reset: "throw it all out ... be the CMO ... own this").

For each of today's free picks (the day's streak pick, plus Sunday's NFL extras) this makes a short clip of Gary
saying his own line on the pick: one of the app's Gary clips (ios/GaryApp/Home/gary-*.mp4, picture over alpha),
his voice reading pick_snapshot.brief.summary, the words on screen as he says them, then the bet.

  wide 1920x1080 -> social-media bucket, gary-call/<date>-<candidate>-x.mp4; social-auto-post attaches it to
                    the X post (it waits up to 15 minutes from the pick for the file, then posts text).
  tall 1080x1920 -> Instagram Reel, through stat-desk/post-reel.mjs --only ig.

Nothing is written for social: the words are Gary's from the app. A pick with no line of its own (props) gets
no clip. Runs from launchd com.gary.gary-call every 2 minutes; state in ~/.config/gary/gary-call/.

  python3 gary_call.py                      today's picks
  python3 gary_call.py --candidate <id>     one game pick by candidate id (renders only, posts nothing)
  python3 gary_call.py --render-only        today's picks, files only
"""
import base64, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "/Users/adam.preda/Gary2.0"
CLIPS = f"{ROOT}/ios/GaryApp/Home"
FONT = f"{ROOT}/GaryMarketing/ads/2026-10-04-sunday-spot/public/BebasNeue-Regular.ttf"
ICON = f"{ROOT}/GaryMarketing/stat-desk/gary-icon.png"
POST_REEL = f"{ROOT}/GaryMarketing/stat-desk/post-reel.mjs"
STATE_DIR = os.path.expanduser("~/.config/gary/gary-call")
OUT_DIR = os.path.join(HERE, "out")
FFMPEG, FFPROBE = "/opt/homebrew/bin/ffmpeg", "/opt/homebrew/bin/ffprobe"
ET = ZoneInfo("America/New_York")

VOICE_ID = "v54DUrx2qPTkyzeYbsyW"          # Uncle Dan, Gary's voice since Nov 6 2026
VOICE_MODEL = "eleven_v4"
VOICE_CUE = "[casual, brash] "
MIN_LEAD_MIN = 20                           # no clip for a game this close to its start
NAVY, GOLD, WHITE, DIM = (0, 23, 65), (226, 185, 90, 255), (255, 255, 255, 255), (255, 255, 255, 178)
# Clips where Gary is simply being Gary. gary-cash and gary-phone ("CASHED") are for results, not calls.
CALL_CLIPS = ["cigar", "pencil", "chuckle", "paper", "watch", "peek", "crystal", "board"]
LEAGUE_TAGS = {"NFL": "#NFL", "NBA": "#NBA", "MLB": "#MLB", "NCAAF": "#CollegeFootball", "NHL": "#NHL", "NCAAB": "#CollegeBasketball"}
TWO_WORD = {"white sox", "red sox", "blue jays", "trail blazers", "maple leafs", "golden knights", "blue jackets", "red wings"}

def log(*a):
    print(datetime.now(timezone.utc).isoformat(timespec="seconds"), "[gary-call]", *a, flush=True)

def load_env():
    env = {}
    for line in open(f"{ROOT}/gary2.0/.env", encoding="utf-8"):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m: env[m.group(1)] = m.group(2).strip("'\"")
    return env

ENV = load_env()
SB, KEY = ENV["SUPABASE_URL"], ENV["SUPABASE_SERVICE_ROLE_KEY"]

def http(url, method="GET", headers=None, body=None, timeout=120):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def rest(path, method="GET", body=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    raw = http(f"{SB}/rest/v1/{path}", method, h, json.dumps(body).encode() if body is not None else None)
    return json.loads(raw) if raw else None

# ── words ────────────────────────────────────────────────────────────────────────────────────────────────
def no_dashes(text):
    """Same swaps as supabase/functions/_shared/noDashes.js (no dashes in anything a reader sees)."""
    t = re.sub(r"(?<=\d)[ \t]*[—–]+[ \t]*(?=\d)", "-", text)
    t = re.sub(r"(?<=\d) - (?=\d)", "-", t)
    t = re.sub(r"(?<=[.,;:!?])[ \t]*[—–]+[ \t]*(?=\S)", " ", t)
    t = re.sub(r"(?<=[.,;:!?]) - (?=\S)", " ", t)
    t = re.sub(r"(?<=\S)[ \t]*[—–]+[ \t]*(?=\S)", ", ", t)
    t = re.sub(r"(?<=\S) - (?=\S)", ", ", t)
    return t.strip()

def short_team(team, league):
    words = str(team or "").split()
    if "NCAA" in str(league).upper() or len(words) < 2: return " ".join(words)
    two = " ".join(words[-2:])
    return two if two.lower() in TWO_WORD else words[-1]

def bet_words(sp):
    words = re.sub(r"\s+[+-]\d{3,4}\s*$", "", str(sp.get("pick_text") or "")).strip()
    for team in re.split(r"\s+@\s+", str(sp.get("matchup") or "")):
        if team and words.startswith(team + " "): return short_team(team, sp.get("league")) + words[len(team):]
    return words

def start_words(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ET)
    hour = d.hour % 12 or 12
    return f"{hour}{'' if d.minute == 0 else ':%02d' % d.minute}{'am' if d.hour < 12 else 'pm'} EST"

def matchup_words(sp):
    parts = re.split(r"\s+@\s+", str(sp.get("matchup") or ""))
    if len(parts) != 2: return str(sp.get("matchup") or "")
    return f"{short_team(parts[0], sp.get('league'))} @ {short_team(parts[1], sp.get('league'))}"

def wrap(words, max_chars):
    """Even lines: the phrase is split into as few lines as fit, each near the same length, so no word is orphaned."""
    total = len(" ".join(w["text"] for w in words))
    n = max(1, -(-total // max_chars))
    while True:
        target = min(max_chars, max(8, -(-total // n) + 3))
        lines, cur = [], []
        for w in words:
            if cur and len(" ".join([x["text"] for x in cur] + [w["text"]])) > target:
                lines.append(cur); cur = []
            cur.append(w)
        if cur: lines.append(cur)
        if len(lines) <= n or target >= max_chars: return lines
        n += 1

def screens(words, max_chars, max_lines=3):
    """Caption screens: phrases (split at , ; . ! ?) wrapped into lines; a screen holds up to three lines and
    clears when the next phrase would not fit. Each line carries the time its first word is spoken."""
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.,;:!?]$", w["text"]): phrases.append(cur); cur = []
    if cur: phrases.append(cur)
    out, screen = [], []
    for ph in phrases:
        lines = wrap(ph, max_chars)
        if len(lines) > max_lines:                          # one very long phrase: its own screens, lines shared evenly
            if screen: out.append(screen); screen = []
            k = -(-len(lines) // max_lines); per = -(-len(lines) // k)
            while len(lines) > per:
                out.append(lines[:per]); lines = lines[per:]
        if len(screen) + len(lines) > max_lines:
            out.append(screen); screen = []
        screen += lines
    if screen: out.append(screen)
    return [[{"text": " ".join(x["text"] for x in ln).upper(), "t": ln[0]["t"]} for ln in sc] for sc in out]

# ── voice ────────────────────────────────────────────────────────────────────────────────────────────────
def speak(line, mp3_path):
    """Gary's voice with word timings. Tries each ElevenLabs key until one has credits. ELEVENLABS_API_KEY_2 in
    .env is the account the live app's Talking Gary runs on (checked Nov 9 2026), so it is the fallback, not the first."""
    text = VOICE_CUE + line
    last = None
    for name in ("ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY_2"):
        key = ENV.get(name)
        if not key: continue
        try:
            raw = http(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_192", "POST",
                       {"xi-api-key": key, "Content-Type": "application/json"},
                       json.dumps({"text": text, "model_id": VOICE_MODEL, "voice_settings": {"speed": 1}}).encode())
            j = json.loads(raw)
            open(mp3_path, "wb").write(base64.b64decode(j["audio_base64"]))
            al = j.get("alignment") or j.get("normalized_alignment") or {}
            return al
        except Exception as e:
            body = e.read().decode()[:200] if hasattr(e, "read") else ""
            last = f"{name}: {e} {body}"
    raise RuntimeError(f"voice failed on every key ({last})")

def duration(path):
    return float(subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())

def word_times(line, alignment, audio_s):
    """Each word of the line with the second it is spoken. Falls back to even pacing by character."""
    tokens = [{"text": m.group(0), "i": m.start()} for m in re.finditer(r"\S+", line)]
    chars, starts = alignment.get("characters") or [], alignment.get("character_start_times_seconds") or []
    full = "".join(chars)
    at = full.find(line)
    if at >= 0 and len(starts) == len(chars):
        for tk in tokens: tk["t"] = float(starts[at + tk["i"]])
    else:
        for tk in tokens: tk["t"] = audio_s * tk["i"] / max(1, len(line))
    return tokens

# ── picture ──────────────────────────────────────────────────────────────────────────────────────────────
def font(size): return ImageFont.truetype(FONT, size)

def fit(draw, text, max_w, size, floor=60):
    while size > floor and draw.textlength(text, font=font(size)) > max_w: size -= 4
    return size

LAYOUT = {
    # wide: Gary on the left from the knees up, words in a column on the right.
    "x":  dict(w=1920, h=1080, gary_h=1500, gary_x=70, gary_y=-70, glow=(540, 620, 560), col_x=990, col_w=880, align="left",
               chars=20, size=112, pitch=124, cap_y=340, lock_y=96, bet_size=240, bet_y=320, sub_size=58, sub_gap=28, cta_size=40),
    # tall: words on top, Gary full height below.
    "ig": dict(w=1080, h=1920, gary_h=1400, gary_x=None, gary_y=530, glow=(540, 1150, 520), col_x=60, col_w=960, align="center",
               chars=25, size=94, pitch=104, cap_y=236, lock_y=66, bet_size=250, bet_y=170, sub_size=56, sub_gap=24, cta_size=40),
}

def background(L, path):
    cx, cy, r = L["glow"]
    expr = f"exp(-((X-{cx})*(X-{cx})+(Y-{cy})*(Y-{cy}))/(2*{r}*{r}))"
    subprocess.check_call([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x001741:s={L['w']}x{L['h']}:d=1", "-frames:v", "1",
        "-vf", f"geq=r='clip({NAVY[0]}+38*{expr},0,255)':g='clip({NAVY[1]}+44*{expr},0,255)':b='clip({NAVY[2]}+70*{expr},0,255)'", path])

def text_x(draw, text, f, L):
    w = draw.textlength(text, font=f)
    return L["col_x"] if L["align"] == "left" else L["col_x"] + (L["col_w"] - w) / 2

def lockup(draw, im, L):
    f = font(58); label = "GARY A.I."
    w = 64 + 16 + draw.textlength(label, font=f)
    x0 = int(L["col_x"] if L["align"] == "left" else L["col_x"] + (L["col_w"] - w) / 2)
    icon = Image.open(ICON).convert("RGBA").resize((64, 64))
    im.paste(icon, (x0, L["lock_y"]), icon)
    draw.text((x0 + 80, L["lock_y"] + 4), label, font=f, fill=WHITE)

def caption_frame(lines, L, path):
    im = Image.new("RGBA", (L["w"], L["h"]), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    lockup(d, im, L)
    for i, text in enumerate(lines):
        size = fit(d, text, L["col_w"], L["size"]); f = font(size)
        d.text((text_x(d, text, f, L), L["cap_y"] + i * L["pitch"]), text, font=f, fill=WHITE)
    im.save(path)

def bet_frame(bet, sub, L, path):
    im = Image.new("RGBA", (L["w"], L["h"]), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    lockup(d, im, L)
    size = fit(d, bet, L["col_w"], L["bet_size"], floor=90); f = font(size)
    d.text((text_x(d, bet, f, L), L["bet_y"]), bet, font=f, fill=GOLD)
    y = L["bet_y"] + int(size * 1.02) + L["sub_gap"]
    fs = font(fit(d, sub, L["col_w"], L["sub_size"], floor=36)); d.text((text_x(d, sub, fs, L), y), sub, font=fs, fill=WHITE)
    fc = font(L["cta_size"]); cta = "FREE ON THE APP STORE"
    d.text((text_x(d, cta, fc, L), y + L["sub_size"] + 22), cta, font=fc, fill=DIM)
    im.save(path)

def render(kind, work, clip, audio, audio_s, words, bet, sub, out_path):
    """One cut. States: each caption screen grows a line at a time as Gary says it; then the bet holds."""
    L = LAYOUT[kind]
    lead, hold = 0.25, 2.4                                   # voice starts a beat in; the bet holds at the end
    total = lead + audio_s + 0.35 + hold
    bg = os.path.join(work, f"bg-{kind}.png"); background(L, bg)
    states = []                                               # (png, start, end)
    n = 0
    for k, sc in enumerate(screens(words, L["chars"])):
        for i in range(len(sc)):
            p = os.path.join(work, f"{kind}-s{n}.png"); n += 1
            caption_frame([ln["text"] for ln in sc[: i + 1]], L, p)
            states.append([p, lead + sc[i]["t"], None, k])
    states[0][1] = 0.0                                        # frame 0 already says something (X shows it as the preview)
    bet_at = lead + audio_s + 0.35
    for i, s in enumerate(states): s[2] = states[i + 1][1] if i + 1 < len(states) else bet_at
    p = os.path.join(work, f"{kind}-bet.png"); bet_frame(bet.upper(), sub.upper(), L, p)
    states.append([p, bet_at, total + 1, -1])

    loops = int(total // 8) + 1
    cmd = [FFMPEG, "-v", "error", "-y", "-loop", "1", "-framerate", "24", "-t", f"{total:.3f}", "-i", bg,
           "-stream_loop", str(loops), "-i", clip, "-itsoffset", f"{lead}", "-i", audio]
    for s in states: cmd += ["-loop", "1", "-framerate", "24", "-t", f"{total:.3f}", "-i", s[0]]
    gx = "(W-w)/2" if L["gary_x"] is None else str(L["gary_x"])
    fc = [f"[1:v]split=2[p][a];[p]crop=776:1244:0:0[pic];[a]crop=776:1244:0:1244,format=gray[al];[pic][al]alphamerge,scale=-2:{L['gary_h']}[gary]",
          f"[0:v][gary]overlay=x={gx}:y={L['gary_y']}[v0]"]
    for i, (png, t0, t1, screen) in enumerate(states):
        fade = f",fade=t=in:st={t0:.3f}:d=0.12:alpha=1" if t0 > 0 else ""
        fc.append(f"[{i + 3}:v]format=rgba{fade}[c{i}]")
        # within a screen the state before stays up through the next line's fade, so lines already showing never dip
        end = t1 + (0.12 if i + 1 < len(states) and states[i + 1][3] == screen else 0)
        fc.append(f"[v{i}][c{i}]overlay=0:0:enable='between(t,{t0:.3f},{end:.3f})'[v{i + 1}]")
    fc.append(f"[v{len(states)}]format=yuv420p[v]")
    cmd += ["-filter_complex", ";".join(fc), "-map", "[v]", "-map", "2:a", "-t", f"{total:.3f}", "-r", "24",
            "-c:v", "libx264", "-profile:v", "high", "-crf", "18", "-color_range", "tv", "-c:a", "aac", "-b:a", "192k",
            "-af", "apad", "-movflags", "+faststart", out_path]
    subprocess.check_call(cmd)
    return total

# ── one pick ─────────────────────────────────────────────────────────────────────────────────────────────
def gary_line(candidate_id):
    rows = rest(f"winners_candidates?select=summary:pick_snapshot->brief->>summary&id=eq.{candidate_id}&limit=1")
    return no_dashes(re.sub(r"\s+", " ", str((rows or [{}])[0].get("summary") or "")).strip())

def make(sp, today):
    cid = sp["candidate_id"]
    line = gary_line(cid)
    if not line: return None
    work = os.path.join(OUT_DIR, f"{today}-{cid}"); os.makedirs(work, exist_ok=True)
    audio, align_path = os.path.join(work, "voice.mp3"), os.path.join(work, "voice.json")
    cached = json.load(open(align_path)) if os.path.exists(align_path) and os.path.exists(audio) else None
    if cached and cached.get("line") == line:               # a retry never pays for the same voice line twice
        alignment = cached["alignment"]
    else:
        alignment = speak(line, audio)
        json.dump({"line": line, "alignment": alignment}, open(align_path, "w"))
    audio_s = duration(audio)
    words = word_times(line, alignment, audio_s)
    pool = CALL_CLIPS + (["spin"] if sp.get("league") == "NBA" else [])
    clip = f"{CLIPS}/gary-{pool[int(cid) % len(pool)]}.mp4"
    bet, sub = bet_words(sp), f"{matchup_words(sp)}   {start_words(sp['commence_time'])}"
    files = {}
    for kind in ("x", "ig"):
        out = os.path.join(work, f"gary-call-{cid}.mp4" if kind == "ig" else f"{today}-{cid}-x.mp4")
        render(kind, work, clip, audio, audio_s, words, bet, sub, out)
        files[kind] = out
    return {"line": line, "bet": bet, "sub": sub, "files": files, "clip": os.path.basename(clip)}

def upload_x(path, name):
    http(f"{SB}/storage/v1/object/social-media/gary-call/{name}", "POST",
         {"Authorization": f"Bearer {KEY}", "Content-Type": "video/mp4", "x-upsert": "true"}, open(path, "rb").read(), timeout=300)

def todays_picks(today):
    picks = rest(f"streak_picks?select=candidate_id,league,kind,pick_text,matchup,commence_time&game_date=eq.{today}") or []
    try:
        extras = rest("rpc/free_pick_extras", "POST", {"p_date": today}) or []
        picks += [e for e in extras if e.get("candidate_id") not in {p["candidate_id"] for p in picks}]
    except Exception as e:
        log(f"free_pick_extras failed: {e}")
    return picks

def main():
    args = sys.argv[1:]
    render_only = "--render-only" in args or "--candidate" in args
    today = datetime.now(ET).strftime("%Y-%m-%d")
    os.makedirs(STATE_DIR, exist_ok=True); os.makedirs(OUT_DIR, exist_ok=True)
    if "--candidate" in args:
        cid = args[args.index("--candidate") + 1]
        rows = rest(f"winners_candidates?select=candidate_id:id,league,kind,pick_text,commence_time,m:pick_snapshot->>matchup,g:pick_snapshot->>game,a:pick_snapshot->>awayTeam,h:pick_snapshot->>homeTeam&id=eq.{cid}")
        picks = [dict(r, matchup=r.get("m") or r.get("g") or (f"{r['a']} @ {r['h']}" if r.get("a") and r.get("h") else "")) for r in rows or []]
    else:
        picks = todays_picks(today)
    for sp in picks:
        cid = sp["candidate_id"]
        state_path = os.path.join(STATE_DIR, f"{today}-{cid}.json")
        state = json.load(open(state_path)) if os.path.exists(state_path) else {}
        if not render_only and (state.get("skip") or (state.get("x") and state.get("ig"))): continue
        if not render_only and state.get("tries", 0) >= 4: continue
        lead_min = (datetime.fromisoformat(sp["commence_time"].replace("Z", "+00:00")) - datetime.now(timezone.utc)).total_seconds() / 60
        if not render_only and lead_min < MIN_LEAD_MIN:
            continue
        if sp.get("kind") != "game":
            state["skip"] = "not a game pick: no line of Gary's own"; json.dump(state, open(state_path, "w")); continue
        state["tries"] = state.get("tries", 0) + 1
        json.dump(state, open(state_path, "w"))
        try:
            made = make(sp, today)
            if not made:
                state["skip"] = "no summary line on this pick"; json.dump(state, open(state_path, "w")); log(f"{cid}: {state['skip']}"); continue
            log(f"{cid}: rendered ({made['clip']}) {made['bet']} | {made['line'][:80]}")
            if render_only:
                print(json.dumps(made, indent=1)); continue
            if not state.get("x"):
                name = os.path.basename(made["files"]["x"])
                upload_x(made["files"]["x"], name)
                state["x"] = f"gary-call/{name}"; json.dump(state, open(state_path, "w")); log(f"{cid}: uploaded {state['x']}")
            if not state.get("ig"):
                tag = LEAGUE_TAGS.get(str(sp.get("league")), "")
                caption = f"{made['line']}\n\n{made['bet']}\n{made['sub'].replace('   ', ' ')}\n\nGary A.I. is free on the App Store.\n\n{tag}".strip()
                r = subprocess.run(["node", POST_REEL, made["files"]["ig"], "--caption", caption, "--only", "ig"], capture_output=True, text=True, timeout=600)
                log(f"{cid}: instagram -> {(r.stdout + r.stderr).strip()[-300:]}")
                if r.returncode == 0:
                    state["ig"] = True; json.dump(state, open(state_path, "w"))
        except Exception as e:
            state["error"] = str(e)[:300]; json.dump(state, open(state_path, "w"))
            log(f"{cid}: FAILED {e}")

if __name__ == "__main__":
    main()
