import sys

import qrcode

url = sys.argv[1] if len(sys.argv) > 1 else "https://5c-scoring-app.onrender.com"
img = qrcode.make(url, box_size=12, border=3)
img.save("qrcode.png")
print(f"Saved qrcode.png for {url}")
