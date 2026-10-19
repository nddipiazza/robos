import sys
from PIL import Image
src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB'); h = round(im.height * width / im.width)
im.resize((width, h), Image.LANCZOS).save(dst, 'JPEG', quality=80, optimize=True)
