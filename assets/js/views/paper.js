// Temuan Paper: the whole manuscript as a readable page (data/paper.json from pipeline/paper_to_json.py),
// with a scroll-spied table of contents, plain-language callouts that link back into the dashboard, and citation export.
import { esc } from '../fmt.js';
import { $, $$, lightbox, copy, toast } from '../ui.js';
import { footer } from './ringkasan.js';

// plain-language reading of each finding, with the dashboard place where the numbers live
const SEHARI = {
  1: ['Bayangkan seluruh sampah dapur dan daun Jawa Barat dikumpulkan setahun: sekitar lima juta ton, delapan kali lebih banyak daripada yang tercatat di sistem nasional. Hampir separuhnya datang dari desa dan kelurahan padat di koridor Jabodebek dan Bandung Raya.', ['peta', { t: 'timbulan' }], 'Lihat peta timbulan'],
  2: ['Saat mudik Lebaran, lampu desa agraris menyala lebih terang dibanding kota, karena penduduk dan pesta pulang ke kampung. Sampah makanan ikut pindah ke desa yang justru paling jauh dari TPA, sehingga modul desa perlu kapasitas cadangan musiman.', ['peta', { t: 'aktivitas' }], 'Lihat deret cahaya malam'],
  3: ['Tidak ada satu ukuran untuk semua desa. Kota cocok dengan hub biogas kecamatan, permukiman pinggir kota dengan digester komunal, desa pasar dan wisata dengan unit modular yang bisa diperbesar, dan desa agraris dengan biodigester rumah tangga.', ['rekomendasi', {}], 'Lihat modul per tipe'],
  4: ['Mengolah sampah di kota paling banyak mengurangi gas rumah kaca, karena sampah kota hampir semuanya masuk TPA. Namun pekerjaan baru justru lebih banyak tercipta di desa, karena modul kecil lebih padat karya.', ['peta', { t: 'dampak' }], 'Lihat peta dampak'],
  5: ['Modul belum untung bila berdiri sendiri, tetapi pemerintah sudah membayar untuk membuang sampah ke TPA. Mengalihkan pembayaran itu ke pengelola desa, ditambah hibah modal sekitar Rp2,7 triliun selama lima tahun, cukup untuk memulai tanpa belanja baru.', ['skenario', {}], 'Coba simulator'],
  6: ['Daerah yang sampahnya paling banyak belum tentu paling siap membiayai. Provinsi perlu membedakan dukungan: daerah berpotensi tinggi tapi kurang siap butuh pendampingan dan bantuan keuangan lebih besar.', ['wilayah', {}], 'Bandingkan wilayah'],
};
let el, ctx, P, io, booted = false;

export async function mount(root, c) {
  el = root; ctx = c;
  P = await c.store.paper();
  const secs = P.sections;
  const authors = P.penulis.map((a, i) => `${esc(a)}<sup>${i === 0 ? '1,3' : '1,2'}</sup>`).join(', ');
  el.innerHTML = `<div class="wrap">
    <div class="paper-hero">
      <div class="kicker">Temuan paper · WJES 2026</div>
      <h1>${esc(P.judul)}</h1>
      <p class="auth">${authors}</p>
      <p style="font-size:12.5px;opacity:.8;margin-top:4px">${P.afiliasi.map((a, i) => `<sup>${i + 1}</sup>${esc(a)}`).join(' · ')}</p>
      <div class="tags">${P.kata_kunci.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
      <div class="hero-cta"><button class="btn btn-light" id="pApa">Salin sitasi APA</button><button class="btn btn-glass" id="pBib">Unduh BibTeX</button><a class="btn btn-glass" href="#peta">Buka dashboard</a></div>
    </div>
    <label class="lbl" style="margin-top:18px" id="tocMLabel">Lompat ke bagian
      <select class="sel" id="tocM" style="margin-top:4px"></select></label>
    <div class="paper-layout">
      <nav class="toc" id="toc" aria-label="Isi paper"><div class="kicker" style="padding:0 10px 8px">Isi paper</div></nav>
      <article class="prose" id="prose"></article>
    </div>${footer()}</div>`;
  const toc = [['abstrak', '0', 'Abstrak dan inti temuan', false]];
  let html = `<section id="abstrak"><h2><span class="no">0</span>Abstrak dan inti temuan</h2>
    <div class="seg abs-toggle" id="absSeg"><button data-l="id" aria-pressed="true">Indonesia</button><button data-l="en" aria-pressed="false">English</button></div>
    <p id="absText">${esc(P.abstrak)}</p>
    <div class="callout"><h4>Artinya dalam bahasa sehari-hari</h4><p>Sampah organik Jawa Barat besar, muncul di tempat dan waktu yang bisa dipetakan sampai desa, dan pengolahannya di tingkat komunitas bisa dibiayai dengan memindahkan anggaran yang sudah ada, bukan menambah belanja baru.</p></div></section>`;
  secs.forEach((s, si) => {
    const n = si + 1;
    toc.push([s.id, String(n), s.title, false]);
    html += `<section id="${s.id}"><h2><span class="no">${n}</span>${esc(s.title)}</h2>${blocks(s.blocks)}`;
    s.subs.forEach((u, ui) => {
      const tm = u.title.match(/^Temuan (\d):\s*(.*)$/);
      toc.push([u.id, `${n}.${ui + 1}`, tm ? `Temuan ${tm[1]}: ${tm[2]}` : u.title, true]);
      html += `<section id="${u.id}"><h3>${esc(u.title)}</h3>${blocks(u.blocks)}${tm && SEHARI[tm[1]] ? sehari(tm[1]) : ''}</section>`;
    });
    html += '</section>';
  });
  $('#prose').innerHTML = html;
  $('#toc').insertAdjacentHTML('beforeend', toc.map(([id, no, t, sub]) => `<a href="#paper?s=${id}" data-id="${id}" class="${sub ? 'sub' : ''}"><span>${no}</span><span>${esc(t)}</span></a>`).join(''));
  $('#tocM').innerHTML = toc.map(([id, no, t]) => `<option value="${id}">${no} ${esc(t)}</option>`).join('');
  $('#tocM').onchange = (e) => scrollToSec(e.target.value);
  $$('#toc a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); scrollToSec(a.dataset.id); }));
  $$('#absSeg button').forEach((b) => (b.onclick = () => { $$('#absSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#absText').textContent = b.dataset.l === 'id' ? P.abstrak : P.abstract; }));
  $$('#prose figure img').forEach((img) => (img.onclick = () => lightbox(img.src, img.alt)));
  $$('#prose [data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const [v, p] = JSON.parse(a.dataset.go); ctx.go(v, p); }));
  $('#pApa').onclick = () => copy(`Paramartha, D. Y., & Apriliawan, Y. E. (2026). ${P.judul}. WJES 2026.`, 'Sitasi APA disalin');
  $('#pBib').onclick = () => {
    const bib = `@inproceedings{paramartha2026komunitas,\n  title = {${P.judul}},\n  author = {Paramartha, Dede Yoga and Apriliawan, Yohanes Eki},\n  booktitle = {WJES 2026},\n  year = {2026}\n}\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bib], { type: 'application/x-bibtex' })); a.download = 'paramartha2026komunitas.bib'; a.click(); toast('BibTeX diunduh');
  };
  const mq = matchMedia('(max-width: 900px)'); const showM = () => ($('#tocMLabel').style.display = mq.matches ? '' : 'none'); showM(); mq.addEventListener('change', showM);
  spy();
}
const sehari = (n) => { const [p, go, l] = SEHARI[n]; return `<div class="callout" style="margin:4px 0 22px"><h4>Artinya dalam bahasa sehari-hari</h4><p>${esc(p)}</p><p style="margin-top:8px"><a class="link" href="#" data-go='${JSON.stringify(go)}'>${l} →</a></p></div>`; };

function blocks(bs) {
  return bs.map((b) => {
    if (b.type === 'p') return `<p>${b.html}</p>`;
    if (b.type === 'eq') return `<div class="eq">${esc(b.text)}</div>`;
    if (b.type === 'labeled') return `<div class="labeled">${b.parts.map((x) => `<div class="lb ${x.label === 'Temuan' ? 'temuan' : ''}"><h5>${esc(x.label)}</h5><p>${x.text}</p></div>`).join('')}</div>`;
    if (b.type === 'figure') { const [no, ...rest] = b.caption.split('. '); return `<figure class="fig"><img src="${b.src}" width="${b.w}" height="${b.h}" loading="lazy" decoding="async" alt="${esc(b.caption)}"><figcaption><b>${esc(no)}.</b> ${esc(rest.join('. '))}<small>${esc(b.source)}</small></figcaption></figure>`; }
    if (b.type === 'table') {
      const [h, ...rows] = b.rows;
      return `<div class="ptable"><div class="cap">${esc(b.caption)}</div><div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr>${h.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, j) => `<td class="${j && /^[-−\d.,%\s()]+$/.test(c) ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="src">${esc(b.source)}</div></div>`;
    }
    return '';
  }).join('');
}

function scrollToSec(id) {
  const t = document.getElementById(id); if (!t) return;
  t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  ctx.setParams('paper', { s: id });
}
function spy() {
  io?.disconnect();
  const links = new Map($$('#toc a').map((a) => [a.dataset.id, a]));
  io = new IntersectionObserver((ents) => {
    const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return;
    links.forEach((a) => a.classList.toggle('on', a.dataset.id === vis.target.id));
    links.get(vis.target.id)?.scrollIntoView({ block: 'nearest' });
  }, { rootMargin: '-90px 0px -65% 0px' });
  $$('#prose section').forEach((s) => io.observe(s));
}

export function update(params) {
  if (params.s) requestAnimationFrame(() => scrollToSec(params.s));
  else if (booted) window.scrollTo({ top: 0 });
  booted = true;
}
