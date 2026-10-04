#!/bin/zsh
# Contact sheet of a cut: ./qa.sh out/<cut>.mp4 "<frame> <frame> ..." [cols]
setopt null_glob
mkdir -p out/qa; rm -f out/qa/f_*.png
for f in ${=2}; do ffmpeg -v error -y -i "$1" -vf "select=eq(n\,$f),scale=${4:-270}:-2" -frames:v 1 out/qa/f_$(printf %03d $f).png; done
python3 - "${3:-7}" <<'PY'
import glob, sys
from PIL import Image, ImageDraw
fs = sorted(glob.glob('out/qa/f_*.png')); cols = int(sys.argv[1]); w, h = Image.open(fs[0]).size
sheet = Image.new('RGB', (cols * (w + 4), ((len(fs) + cols - 1) // cols) * (h + 20)), (30, 30, 30)); d = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    x, y = (i % cols) * (w + 4) + 2, (i // cols) * (h + 20) + 18
    sheet.paste(Image.open(f), (x, y)); d.text((x + 4, y - 16), f[-7:-4], fill=(255, 255, 0))
sheet.save('out/qa/sheet.png'); print(sheet.size)
PY
