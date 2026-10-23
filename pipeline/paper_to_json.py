"""
Mengubah naskah paper (.docx) menjadi data/paper.json dan gambar data/paper/gambar_<n>.webp untuk tab Temuan Paper.

Pemakaian:
    python pipeline/paper_to_json.py "Paper_WJES 2026_Paramartha n Apriliawan_revisi.docx"

Aturan struktur naskah (gaya template WJES):
- judul bab: paragraf gaya Ventura-Abstract berhuruf kapital (PENDAHULUAN, METODOLOGI, ...)
- subbab: paragraf Ventura-Abstract pendek tanpa titik akhir (Desain penelitian dan data, Temuan 1: ...)
- gambar: paragraf berisi gambar, lalu Caption "Gambar N." dan Caption "Sumber: ..."
- tabel: Caption "Tabel N.", lalu tabel, lalu baris "Sumber: ..."
- paragraf temuan memuat label sebaris (Temuan. Bukti. Interpretasi. ...) yang dipecah menjadi bagian berlabel
"""
import io, json, os, re, sys
import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, 'data')
IMG = os.path.join(OUT, 'paper')
LABELS = ['Temuan', 'Bukti', 'Interpretasi', 'Teori dan literatur', 'Konteks empiris', 'Kebaruan']
SKIP_SECTIONS = {'REFERENSI'}


def runs_html(p):
    """Teks paragraf dengan miring dan tebal dipertahankan, karakter HTML di-escape."""
    out = []
    for r in p.runs:
        t = r.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        if not t:
            continue
        if r.italic:
            t = f'<em>{t}</em>'
        if r.bold:
            t = f'<strong>{t}</strong>'
        out.append(t)
    return re.sub(r'</em><em>|</strong><strong>', '', ''.join(out)).strip()


def split_labels(text):
    # label ditulis tebal di naskah: <strong>Temuan.</strong> ...
    pat = r'<strong>(' + '|'.join(re.escape(l) for l in LABELS) + r')\.</strong>\s*'
    parts = re.split(pat, text)
    if len(parts) < 3 or parts[0].strip():
        return None
    return [{'label': parts[i], 'text': parts[i + 1].strip()} for i in range(1, len(parts) - 1, 2)]


def is_heading(p, text):
    if p.style.name != 'Ventura-Abstract' or not text or len(text) > 140:
        return 0
    if text.isupper() and len(text) < 40:
        return 1
    if not text.endswith('.') and len(text) < 140 and not re.search(r'\(\d\)$', text):
        return 2
    return 0


def save_image(doc, rid, n):
    part = doc.part.related_parts[rid]
    im = Image.open(io.BytesIO(part.blob)).convert('RGB')
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    os.makedirs(IMG, exist_ok=True)
    name = f'gambar_{n}.webp'
    im.save(os.path.join(IMG, name), 'WEBP', quality=82, method=6)
    return f'data/paper/{name}', im.width, im.height


def main(path):
    doc = docx.Document(path)
    body = list(doc.element.body.iterchildren())
    meta = {'judul': '', 'penulis': [], 'afiliasi': [], 'abstrak': '', 'abstract': '', 'kata_kunci': [], 'keywords': []}
    sections, cur, sub = [], None, None
    pending_img, pending_tab, fig_n = None, None, 0
    mode = 'front'

    def add(block):
        target = sub if sub is not None else cur
        if target is not None:
            target['blocks'].append(block)

    for i, el in enumerate(body):
        tag = el.tag.split('}')[1]
        if tag == 'tbl':
            t = Table(el, doc)
            rows = [[c.text.strip() for c in r.cells] for r in t.rows]
            # sel tergabung muncul berulang; buang duplikasi berturut-turut per baris
            rows = [[c for j, c in enumerate(r) if j == 0 or c != r[j - 1] or c == ''] for r in rows]
            blk = {'type': 'table', 'caption': pending_tab or '', 'rows': rows, 'source': ''}
            add(blk)
            pending_tab = blk
            continue
        if tag != 'p':
            continue
        p = Paragraph(el, doc)
        text = p.text.strip()
        style = p.style.name
        blips = el.findall('.//' + qn('a:blip'))

        if mode == 'front':
            if style == 'Title':
                meta['judul'] = text
            elif style == 'Ventura-Author':
                meta['penulis'] = [re.sub(r'[\d,]+$', '', a).strip() for a in re.split(r',\s(?=[A-Z])', text)]
            elif style == 'Ventura-AuthorAddress' and text and not text.startswith('Email'):
                meta['afiliasi'].append(re.sub(r'^\d\s*', '', text))
            elif style == 'Ventura-AuthorAddress' and text.startswith('Email'):
                meta['email'] = text.split(':', 1)[1].strip()
            elif text in ('ABSTRACT', 'ABSTRAK'):
                mode = 'abs_en' if text == 'ABSTRACT' else 'abs_id'
            continue
        if mode in ('abs_en', 'abs_id', 'kw_en', 'kw_id'):
            if text in ('Keywords:', 'Kata Kunci:'):
                mode = 'kw_en' if mode == 'abs_en' else 'kw_id'
            elif text == 'ABSTRAK':
                mode = 'abs_id'
            elif mode in ('kw_en', 'kw_id') and text:
                meta['keywords' if mode == 'kw_en' else 'kata_kunci'] = [k.strip() for k in text.split(';')]
                if mode == 'kw_id':
                    mode = 'body'
            elif text:
                meta['abstract' if mode == 'abs_en' else 'abstrak'] += text
            continue

        if blips:
            fig_n += 1
            src, w, h = save_image(doc, blips[0].get(qn('r:embed')), fig_n)
            pending_img = {'type': 'figure', 'src': src, 'w': w, 'h': h, 'caption': '', 'source': ''}
            add(pending_img)
            continue
        if not text:
            continue
        if style == 'Caption' or (style == 'Ventura-Content' and text.startswith('Sumber')):
            if text.startswith('Gambar') and pending_img:
                pending_img['caption'] = text
            elif text.startswith('Tabel'):
                pending_tab = text
            elif text.startswith('Sumber'):
                if isinstance(pending_tab, dict):
                    pending_tab['source'] = text
                    pending_tab = None
                elif pending_img:
                    pending_img['source'] = text
                    pending_img = None
            continue

        lvl = is_heading(p, text)
        if lvl == 1:
            if text in SKIP_SECTIONS:
                break
            cur = {'id': re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-'), 'title': text.capitalize(), 'blocks': [], 'subs': []}
            sections.append(cur)
            sub = None
            continue
        if lvl == 2 and cur is not None:
            sid = f"{cur['id']}-{len(cur['subs']) + 1}"
            sub = {'id': sid, 'title': text, 'blocks': []}
            cur['subs'].append(sub)
            continue
        if re.search(r'\(\d\)$', text):
            add({'type': 'eq', 'text': text})
            continue
        html = runs_html(p)
        parts = split_labels(html)
        add({'type': 'labeled', 'parts': parts} if parts else {'type': 'p', 'html': html})

    meta['sections'] = sections
    with open(os.path.join(OUT, 'paper.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))
    print('bab', [s['title'] for s in sections], 'gambar', fig_n)


if __name__ == '__main__':
    main(sys.argv[1])
