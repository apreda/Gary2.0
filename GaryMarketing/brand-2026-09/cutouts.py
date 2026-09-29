"""Cut each phone out of the Sep 24 App Store frames: the device outline only, transparent around it."""
from PIL import Image, ImageDraw
import pathlib
SRC = pathlib.Path(__file__).resolve().parents[1] / "appstore-2026-09-24-v2.27/screenshots"
OUT = pathlib.Path(__file__).resolve().parent / "src"
BOX = (153, 1008, 1168, 2868)   # measured device outline (x 153-1167, top 1008); the frame cuts it at the bottom
RADIUS = 150
for f in sorted(SRC.glob("*.png")):
    im = Image.open(f).convert("RGBA").crop(BOX)
    w, h = im.size
    s = 4
    mask = Image.new("L", (w * s, (h + RADIUS) * s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * s - 1, (h + RADIUS) * s - 1), radius=RADIUS * s, fill=255)
    mask = mask.resize((w, h + RADIUS), Image.LANCZOS).crop((0, 0, w, h))
    im.putalpha(mask)
    im.save(OUT / f"{f.stem}-phone.png")
    print(f.stem, im.size)

# Two Winners pieces that are cards, not phones: the unveiled ticket (it overhangs the phone in its
# frame) and the scorebook. Soft-edged so the frame's own glow blends into the new background.
from PIL import ImageFilter
def card(stem, box, out_name, edge=48):
    im = Image.open(SRC / f"{stem}.png").convert("RGBA").crop(box)
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle((edge, edge, w - edge, h - edge), fill=255)
    im.putalpha(mask.filter(ImageFilter.GaussianBlur(edge / 2)))
    im.save(OUT / out_name)
    print(out_name, im.size)
card("04-unveil", (20, 1840, 1300, 2800), "winners-ticket.png")
card("05-scorebook", (20, 860, 1300, 2580), "scorebook-card.png")
