import sys
from PIL import Image, ImageChops
out, offs, x1 = sys.argv[1], sys.argv[2].split(','), int(sys.argv[3])
for o in offs:
    a = Image.open(f'{out}/ref-{o}s.png').convert('RGB'); b = Image.open(f'{out}/drag-{o}s.png').convert('RGB')
    d = ImageChops.difference(a, b)
    g = d.convert('L').point(lambda v: 255 if v > 24 else 0)
    bb = g.getbbox()
    W, H = a.size
    px = g.load()
    cols = [x for x in range(W) if any(px[x, y] for y in range(0, H, 2))]
    head = [(x, y) for x in range(max(0, x1 - 30), min(W, x1 + 30)) for y in range(H) if px[x, y]]
    hw = (max(p[1] for p in head) - min(p[1] for p in head)) if head else 0
    ahead = sum(1 for x in range(x1 + 40, W) for y in range(0, H, 2) if px[x, y])
    area = sum(1 for x in range(0, W, 2) for y in range(0, H, 2) if px[x, y]) * 4
    d.point(lambda v: min(255, v * 4)).save(f'{out}/diff-{o}s.png')
    print(f'+{o}s bbox={bb} area={area/(W*H)*100:.2f}% xspan={(max(cols)-min(cols))/W*100 if cols else 0:.1f}% headH={hw/W*100:.1f}%W ahead_px={ahead}')
