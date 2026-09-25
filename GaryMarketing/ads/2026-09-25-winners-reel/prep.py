"""Copies the captures into public/ and cuts the GaryIconBG mark off its black tile."""
import shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

for name in ["unveil.mp4", "revealall.mp4", "board_sealed.png", "recap_top.png"]:
    shutil.copy(f"capture/{name}", f"public/{name}")

im = Image.open("../../../ios/GaryApp/Assets.xcassets/GaryIconBG.imageset/GaryIconBG.png").convert("RGBA")
a = np.asarray(im).astype(np.int16)
dark = a[..., :3].max(axis=2) < 28
# the tile is the dark region connected to the corners (flood fill)
lab, _ = ndimage.label(dark)
corners = {lab[0, 0], lab[0, -1], lab[-1, 0], lab[-1, -1]} - {0}
tile = np.isin(lab, list(corners))
alpha = np.where(tile, 0, 255).astype(np.uint8)
alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.2)))
out = np.asarray(im).copy()
out[..., 3] = alpha
Image.fromarray(out).save("public/gary-mark.png")
print("corner alpha before:", np.asarray(im)[0, 0], "tile px:", tile.sum())
