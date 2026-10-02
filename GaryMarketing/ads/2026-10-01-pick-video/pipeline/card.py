#!/usr/bin/env python3
"""THE FREE PICK CARD (founder, Oct 2 2026: "post it as the product, not as text").

One square image a day for X: the Gary A.I. header and, under it, the app's
own breakdown screen for the free pick, cropped to the pick card and Gary's
top reason so both read on a phone. Every app pixel is the real screenshot
(analyze.py's page.png); only the stage, the header and the frame are drawn.

    card.py <page.png> <measured.json> <out.png> --date "FRI OCT 2"
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
SIZE = 1080
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("measured")
    ap.add_argument("out")
    ap.add_argument("--date", default="")
    a = ap.parse_args()

    page = Image.open(a.page).convert("RGB")
    m = json.loads(Path(a.measured).read_text())["page"]
    tops = m.get("reasonTops") or []
    # The pick card and Gary's first reason, ending just above the next reason's divider.
    top = max(0, int(m["cardTop"]) - 28)
    bottom = int(tops[1]) - 10 if len(tops) > 1 else int(m.get("containerEnd", m["cardBottom"] + 600))
    shot = page.crop((0, top, page.width, min(page.height, bottom)))

    img = Image.new("RGB", (SIZE, SIZE), STAGE)
    # A low gold glow behind the screen, the stage light of the video.
    glow = Image.new("RGB", (SIZE, SIZE), STAGE)
    ImageDraw.Draw(glow).ellipse((140, 330, 940, 1130), fill=(46, 34, 10))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 1.0)
    draw = ImageDraw.Draw(img)

    # Header: the icon and GARY A.I., the date on the right, then TODAY'S FREE PICK.
    icon = Image.open(PUBLIC / "icon.png").convert("RGBA").resize((76, 76), Image.LANCZOS)
    img.paste(rounded(icon, 18), (MARGIN, 52), rounded(icon, 18))
    draw.text((MARGIN + 96, 58), "GARY A.I.", font=bebas(58), fill=CREAM)
    if a.date:
        f = bebas(46)
        w = draw.textlength(a.date, font=f)
        draw.text((SIZE - MARGIN - w, 66), a.date, font=f, fill=SUPPORT)
    gold_text(img, (MARGIN, 140), "TODAY'S FREE PICK", bebas(118))

    # The app screen, scaled to the column, framed like the phone it came from.
    room_w, room_h = SIZE - 2 * MARGIN, SIZE - 290 - MARGIN
    scale = min(room_w / shot.width, room_h / shot.height)
    shot = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS)
    x = (SIZE - shot.width) // 2
    y = 290 + (room_h - shot.height) // 2
    framed = rounded(shot, 34)
    img.paste(framed, (x, y), framed)
    ImageDraw.Draw(img).rounded_rectangle((x - 1, y - 1, x + shot.width, y + shot.height), radius=34,
                                          outline=(92, 74, 28), width=2)

    img.save(a.out, "PNG", optimize=True)
    print(f"card {a.out}: screen {shot.width}x{shot.height} from y {top}-{bottom}")


if __name__ == "__main__":
    main()
