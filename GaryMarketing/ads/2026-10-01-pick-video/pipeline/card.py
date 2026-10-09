#!/usr/bin/env python3
"""THE FREE PICK CARD (founder, Oct 2 2026: "post it as the product, not as text").

One image a day for Instagram: a quiet header (the icon, "Gary's free pick",
the date) and, under it, the app's own breakdown screen for the free pick,
cropped to the pick card and Gary's first reasons. Every app pixel is the real
screenshot (analyze.py's page.png); only the stage, the header and the frame
are drawn.

Oct 9 2026 (Adam): two or three of the app's reasons instead of one, and the
free-pick heading less in your face. The feed post is 4:5 with two reasons;
the story (9:16) carries three and keeps clear of Instagram's top and bottom bars.

    card.py <page.png> <measured.json> <out.png> --date "FRI OCT 2" [--format feed|story|square] [--reasons N]
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
FORMATS = {
    # width, height, header top, screen top, bottom margin, default reasons
    "feed": (1080, 1350, 54, 150, 54, 2),
    "story": (1080, 1920, 230, 330, 300, 3),
    "square": (1080, 1080, 52, 290, 60, 1),
}
STAGE = (5, 3, 4)
CREAM = (242, 237, 228)
GOLD = (240, 205, 98)
GOLD_DEEP = (201, 162, 39)
SUPPORT = (189, 182, 170)
MARGIN = 60


def bebas(px):
    return ImageFont.truetype(str(PUBLIC / "BebasNeue-Regular.ttf"), px)


def gold_text(img, xy, text, font):
    """Text filled with the brand's top-to-bottom gold gradient."""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255)
    box = mask.getbbox()
    if not box:
        return
    grad = Image.new("RGB", (1, box[3] - box[1]))
    for y in range(grad.height):
        t = y / max(1, grad.height - 1)
        grad.putpixel((0, y), tuple(round(GOLD[i] + (GOLD_DEEP[i] - GOLD[i]) * t) for i in range(3)))
    grad = grad.resize((box[2] - box[0], box[3] - box[1]))
    img.paste(grad, box[:2], mask.crop(box))


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def feathered(size, edge):
    """An alpha mask that fades the last `edge` pixels of each side to nothing."""
    w, h = size
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rectangle((edge // 2, edge // 2, w - 1 - edge // 2, h - 1 - edge // 2), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(edge / 3))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("measured")
    ap.add_argument("out")
    ap.add_argument("--date", default="")
    ap.add_argument("--format", choices=sorted(FORMATS), default="feed")
    ap.add_argument("--reasons", type=int, default=0)
    a = ap.parse_args()
    W, H, head_y, screen_y, bottom_m, default_reasons = FORMATS[a.format]
    want = a.reasons or default_reasons

    page = Image.open(a.page).convert("RGB")
    m = json.loads(Path(a.measured).read_text())["page"]
    tops = m.get("reasonTops") or []
    # The pick card and Gary's first reasons, ending just above the next reason's divider
    # (or at the end of the reasons when the pick has no more than asked for).
    n = max(1, min(want, len(tops)))
    top = max(0, int(m["cardTop"]) - 28)
    bottom = int(tops[n]) - 10 if len(tops) > n else int(m.get("containerEnd", m["cardBottom"] + 600))
    shot = page.crop((0, top, page.width, min(page.height, bottom)))

    img = Image.new("RGB", (W, H), STAGE)
    # A low gold glow behind the screen, the stage light of the video.
    glow = Image.new("RGB", (W, H), STAGE)
    ImageDraw.Draw(glow).ellipse((140, screen_y + 40, W - 140, H - 120), fill=(46, 34, 10))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 1.0)
    draw = ImageDraw.Draw(img)

    # Header, one quiet line: the icon and "GARY'S FREE PICK", the date on the right.
    icon = Image.open(PUBLIC / "icon.png").convert("RGBA").resize((60, 60), Image.LANCZOS)
    img.paste(rounded(icon, 14), (MARGIN, head_y), rounded(icon, 14))
    gold_text(img, (MARGIN + 78, head_y + 6), "GARY'S FREE PICK", bebas(54))
    if a.date:
        f = bebas(44)
        w = draw.textlength(a.date, font=f)
        draw.text((W - MARGIN - w, head_y + 10), a.date, font=f, fill=SUPPORT)

    # The app screen, scaled to the width. No frame of our own (Oct 9, Adam: no "double box"): the
    # screenshot's black background melts into the stage, so only the app's own pick card and reasons
    # box show. The app draws its own side margins, so the screen may use the full width.
    room_w, room_h = W, H - screen_y - bottom_m
    scale = min(room_w / shot.width, room_h / shot.height)
    shot = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS)
    x = (W - shot.width) // 2
    y = screen_y + (room_h - shot.height) // 2
    img.paste(shot, (x, y), feathered(shot.size, 48))

    img.save(a.out, "PNG", optimize=True)
    print(f"card {a.out}: {a.format} {W}x{H}, {n} reasons, screen {shot.width}x{shot.height} from y {top}-{bottom}")


if __name__ == "__main__":
    main()
