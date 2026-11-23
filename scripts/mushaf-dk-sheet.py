# Mushaf prototype: contact sheet of the /mushaf/dk screenshots (PIL; no ImageMagick here).
#   python scripts/mushaf-dk-sheet.py [shotsDir]
import sys, os
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1] if len(sys.argv) > 1 else '.shots'
pages = [1, 2, 3, 50, 300, 604]
rows = [('light', ''), ('dark', ''), ('light', '-squeeze')]
labels = {('light', ''): 'Light (tighten, 92% size)', ('dark', ''): 'Dark (tighten, 92% size)', ('light', '-squeeze'): 'Light, DK settings (squeeze)'}
W, H = 390, 700  # each cell: the top 1400 px of a 2x 390x844 shot, halved
pad, head = 12, 34
try:
    font = ImageFont.truetype('arial.ttf', 18)
except OSError:
    font = ImageFont.load_default()
sheet = Image.new('RGB', (pad + len(pages) * (W + pad), len(rows) * (H + head + pad) + pad), 'white')
dr = ImageDraw.Draw(sheet)
for r, (scheme, suffix) in enumerate(rows):
    y = pad + r * (H + head + pad)
    dr.text((pad, y + 6), labels[(scheme, suffix)], fill='black', font=font)
    for c, p in enumerate(pages):
        f = os.path.join(d, f'dk-p{p}-{scheme}{suffix}.png')
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert('RGB').crop((0, 0, 780, 1400)).resize((W, H), Image.LANCZOS)
        x = pad + c * (W + pad)
        sheet.paste(im, (x, y + head))
        dr.text((x + W - 70, y + 6), f'p. {p}', fill='black', font=font)
out = os.path.join(d, 'contact-sheet.png')
sheet.save(out, optimize=True)
print(out, sheet.size)
