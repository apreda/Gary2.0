#!/usr/bin/env python3
"""Measure one free-pick unveil recording and the breakdown screenshots.

Usage: analyze.py <recording.mp4> <page_00.png> [page_01.png ...] --out props.json --page-out page.png

Everything the video needs is measured from the app's own pixels, so a longer
team name, a two-line card or a fifth reason still frames right. The numbers are
in recording seconds and in recording pixels (1320 x 2868, the iPhone 17 Pro Max
simulator): when the board fades and the pack sits alone, where the pack and the
centered card sit, the card's slide to the top (20 fps), and on the stitched
breakdown page the card, each reason's top and the container's end. Validated
Oct 1 2026 against the hand-measured Sep 28 Bears unveil.
"""
import json, subprocess, sys
import numpy as np
from PIL import Image

W, H = 1320, 2868
FPS = 20
NAV_BOTTOM = 256          # status bar + the unveil's nav row
TAB_TOP = 2500            # stay clear of the app's tab bar and its shadow


def frames(path, fps=FPS, scale=2):
    """Grayscale and RGB frames at half resolution, streamed from ffmpeg."""
    w, h = W // scale, H // scale
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    size = w * h * 3
    i = 0
    try:
        while True:
            buf = p.stdout.read(size)
            if len(buf) < size:
                break
            yield i / fps, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            i += 1
    finally:
        p.kill()
        p.wait()


def gold_mask(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (r > 70) & (g > 50) & (r - b > 35) & (r < 235)


def card_top(rgb, lo, hi, need):
    """First row in [lo, hi) (half-res) whose gold pixels across the card width reach `need`: the card's top border."""
    m = gold_mask(rgb[:, 100:560:2])
    counts = m.sum(axis=1)
    for y in range(lo, hi):
        if counts[y] >= need:
            return y
    return None


def bright_rows(gray, lo, hi, thr=62, need=6):
    cols = gray[:, 15:W // 2 - 15:4]
    c = (cols > thr).sum(axis=1)
    ys = [y for y in range(lo, hi) if c[y] >= need]
    return ys


def analyze_recording(path):
    left = []                      # brightness of the left strip (the board behind the pack)
    tops = []                      # card top border per frame
    packs = []
    for t, rgb in frames(path):
        gray = rgb.mean(axis=2)
        left.append((t, float(gray[150:1250, 0:60].mean())))
        tops.append((t, card_top(rgb, 130, 1250, 115)))
        packs.append((t, gray))
    # The pack sits alone once the board behind it has faded.
    vals = np.array([v for _, v in left])
    hi, lo = np.percentile(vals[: max(3, len(vals) // 6)], 50), vals.min()
    pack_in = None
    seen_bright = False
    for t, v in left:
        if v > lo + 0.6 * (hi - lo):
            seen_bright = True
        if seen_bright and v <= lo + 0.08 * (hi - lo) + 0.5:
            pack_in = t
            break
    if pack_in is None:
        raise SystemExit("pack never appeared alone: board did not fade")
    pack_in += 0.05
    gray_at = dict(packs)
    g0 = gray_at[min(gray_at, key=lambda t: abs(t - (pack_in + 0.2)))]
    ys = bright_rows(g0, NAV_BOTTOM // 2, TAB_TOP // 2 - 30)
    pack_top, pack_bottom = (ys[0] * 2, ys[-1] * 2) if ys else (800, 1896)
    # The centered card: its top border, steady from pack_in + 3.2 until the slide.
    centered = [y for t, y in tops if pack_in + 3.2 <= t <= pack_in + 5.5 and y is not None]
    if not centered:
        raise SystemExit("centered card not found")
    c_top = int(np.median(centered))
    slide = None
    for t, y in tops:
        if t > pack_in + 3.5 and y is not None and y < c_top - 6:
            slide = t - 0.05
            break
    if slide is None:
        raise SystemExit("card never slid to the top")
    table = []
    settled = None
    prev = None
    still = 0
    for t, y in tops:
        if t < slide:
            continue
        if y is None:
            continue
        table.append([round(t, 3), int(y * 2)])
        if prev is not None and abs(y - prev) <= 1:
            still += 1
            if still >= 3 and settled is None:
                settled = t
        else:
            still = 0
        prev = y
        if settled is not None and t > settled + 0.2:
            break
    table[0][1] = c_top * 2
    # Card bottom when centered: the last strong gold row below the top.
    t_mid = pack_in + 4.3
    rgb_mid = None
    for t, rgb in frames(path):
        if t >= t_mid:
            rgb_mid = rgb
            break
    m = gold_mask(rgb_mid[:, 100:560:2]).sum(axis=1)
    rows = [y for y in range(c_top + 60, min(c_top + 400, TAB_TOP // 2)) if m[y] >= 115]
    c_bottom = (rows[-1] if rows else c_top + 240) * 2
    return {
        "packIn": round(pack_in, 3), "packTop": pack_top, "packBottom": pack_bottom,
        "cardTop": c_top * 2, "cardBottom": c_bottom,
        "slide": round(slide, 3), "settled": round((settled or slide + 0.8) + 0.35, 3),
        "slideTable": table,
    }


def stitch(pages):
    imgs = [np.asarray(Image.open(p).convert("RGB")) for p in pages]
    page = imgs[0][:2590].copy()
    covered = 2590
    total_off = 0
    prev = imgs[0]
    for img in imgs[1:]:
        g_prev, g = prev.mean(axis=2), img.mean(axis=2)
        band = g_prev[1950:2150, 100:1220]
        best, off = None, 0
        # Every pixel offset: a scroll can land on an odd pixel (Oct 1: 671 px), and a step of 2 misses it.
        for o in range(0, 1400):
            y = 1950 - o
            if y < 760:
                break
            d = np.abs(band - g[y:y + 200, 100:1220]).mean()
            if best is None or d < best:
                best, off = d, o
        if off == 0 or best is None or best > 3:
            break                      # the page did not scroll any further
        total_off += off
        lo = max(covered, 900 + total_off)
        hi = TAB_TOP + total_off
        if hi > lo:
            page = np.vstack([page, img[lo - total_off:hi - total_off]])
            covered = hi
        prev = img
    return page


def page_geometry(page):
    gm = gold_mask(page)
    width_counts = gm[:, 100:1220:4].sum(axis=1)
    # The pinned card: the first long gold border below the nav row, then its bottom border.
    card_top = next(y for y in range(NAV_BOTTOM + 10, 900) if width_counts[y] >= 200)
    card_bottom = next(y for y in range(card_top + 200, 1100) if width_counts[y] >= 200)
    # The reasons container is filled (15,13,11) on the page's (5,3,4): its first and last filled rows
    # down the middle are its top and its end.
    mid = page[:, 600:720].mean(axis=(1, 2))
    filled = [y for y in range(card_bottom + 20, page.shape[0]) if mid[y] >= 10]
    reasons_top = filled[0] if filled else card_bottom + 60
    end = filled[-1] if filled else page.shape[0] - 30
    # Each later reason begins at a dashed divider: a dim gold row (61,50,18) broken into dashes.
    p = page[:, 120:1200].astype(int)
    dash = (p[..., 0] > 45) & (p[..., 0] - p[..., 2] > 30)
    dividers = []
    for y in range(reasons_top + 150, end - 150):
        n = int(dash[y].sum())
        if 350 <= n <= 850 and int((np.diff(dash[y].astype(int)) == 1).sum()) >= 20:
            if not dividers or y - dividers[-1] > 40:
                dividers.append(y)
    return {"cardTop": int(card_top), "cardBottom": int(card_bottom), "reasonsTop": int(reasons_top),
            "reasonTops": [int(reasons_top)] + [int(d) for d in dividers], "containerEnd": int(end), "height": int(page.shape[0])}


if __name__ == "__main__":
    args = sys.argv[1:]
    out = args[args.index("--out") + 1]
    page_out = args[args.index("--page-out") + 1]
    files = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
    rec, pages = files[0], files[1:]
    r = analyze_recording(rec)
    page = stitch(pages)
    Image.fromarray(page).save(page_out)
    g = page_geometry(page)
    json.dump({"recording": r, "page": g}, open(out, "w"), indent=1)
    print(json.dumps({"recording": {k: v for k, v in r.items() if k != "slideTable"}, "slideRows": len(r["slideTable"]), "page": g}))
