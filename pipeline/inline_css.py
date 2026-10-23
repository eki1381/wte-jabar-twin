"""
Langkah terbit (dijalankan oleh .github/workflows/pages.yml, bukan untuk pengembangan lokal):
menyisipkan assets/css/style.css ke index.html dan melepas preload huruf, sehingga halaman pertama
dicat tanpa menunggu permintaan CSS kedua. Di repositori, index.html tetap memakai <link> biasa.

Pemakaian: python pipeline/inline_css.py
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html_path = os.path.join(BASE, 'index.html')
css = open(os.path.join(BASE, 'assets', 'css', 'style.css'), encoding='utf-8').read()
css = css.replace("url('../fonts/", "url('assets/fonts/")
html = open(html_path, encoding='utf-8').read()
link = '<link rel="stylesheet" href="assets/css/style.css">'
preload = '<link rel="preload" href="assets/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossorigin>\n'
assert link in html, 'tautan style.css tidak ditemukan di index.html'
html = html.replace(preload, '').replace(link, f'<style>{css}</style>')
open(html_path, 'w', encoding='utf-8', newline='').write(html)
print(f'style.css ({len(css) // 1000} KB) disisipkan ke index.html')
