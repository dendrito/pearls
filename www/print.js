/* Print for Shabbat: Pearls lays out the pages itself, so a printout reads well on the table and a booklet folds right.
   app.js gathers the text (printGather) into a plain document:
     doc = { title, heTitle, sub, vol, lang, dateLine, credits:[html], extras:{daily, cal},
             chapters:[{ id, n, vol, eyebrow, title, titleHe, note, secs:[{ n, title, html, ai, dir, lang, he:{title, html}|null }] }] }
   and this file turns it into sheets of paper, in true millimetres:
     pages   one page a sheet, A4 or Letter
     booklet half-size pages printed two to a side, in folding order (n, 1 | 2, n-1 …); long jobs become several booklets
     cards   quarter-sheet cards, four to a sheet, each section on its own card, with cut lines
     trifold one sheet folded in three: cover, three inside panels, the flap and the back
   The paginator pours each section's nodes into fixed boxes and splits a paragraph between words when a box fills
   (a heading never stays alone at the foot of a box). Nothing here links anywhere: print has no buttons.
   Styles are print.css. Flat, like the app: no gradient that blends, no blurred shadow. */
(function () {
  "use strict";
  const MM = 96 / 25.4;   // CSS pixels in a millimetre
  const PAPER = { a4: { w: 210, h: 297, name: "A4" }, letter: { w: 215.9, h: 279.4, name: "Letter" } };
  const STYLES = [
    { id: "classic",  name: "Classic",              desc: "One column, a quiet serif and wide margins.", formats: ["pages", "booklet"], fs: [11, 9.6] },
    { id: "twocol",   name: "Two columns",          desc: "Newspaper columns: more on a page.", formats: ["pages", "booklet"], fs: [9.8, 8.6], cols: 2 },
    { id: "sbs",      name: "Side by side",         desc: "English and Hebrew next to each other, section by section.", formats: ["pages", "booklet"], fs: [9.4, 8.2], sbs: true },
    { id: "large",    name: "Large print",          desc: "Big, open letters for easy reading.", formats: ["pages", "booklet"], fs: [15, 12.5] },
    { id: "heritage", name: "Heritage",             desc: "Terracotta and indigo, the book's emblem, a drop capital.", formats: ["pages", "booklet"], fs: [10.8, 9.4] },
    { id: "azulejo",  name: "Azulejo",              desc: "A painted-tile border in cobalt and saffron.", formats: ["pages", "booklet"], fs: [10.4, 9.2] },
    { id: "arch",     name: "Mizraḥ arch",          desc: "The title under a horseshoe arch, a woven band below.", formats: ["pages", "booklet"], fs: [10.8, 9.4] },
    { id: "riso",     name: "Riso",                 desc: "Two bright inks, a bold number, playful and modern.", formats: ["pages", "booklet"], fs: [10.6, 9.3] },
    { id: "table",    name: "Shabbat table sheet",  desc: "A one-sheet paper for the table: the text, the Daily Pearl and the calendar.", formats: ["pages"], fs: [8.8, 8.8], cols: 2 },
    { id: "cards",    name: "Pocket cards",         desc: "Quarter-page cards, one section each, to pass around the table.", formats: ["cards"], fs: [8.2, 8.2] },
    { id: "trifold",  name: "Tri-fold leaflet",     desc: "One sheet folded in three, with a cover.", formats: ["trifold"], fs: [8.4, 8.4] }
  ];
  const ST = Object.fromEntries(STYLES.map(s => [s.id, s]));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  // the volume's cover art, whole ("meet"): a card crops it to fill, a printed frame shows all of it
  const art = slug => ((window.PEARLS_COVERS && slug && window.PEARLS_COVERS.svg(slug)) || "").replace("xMidYMid slice", "xMidYMid meet");
  const tick = () => new Promise(r => setTimeout(r, 0));

  // Hebrew numerals for section numbers (Heritage): 15 and 16 are written ט״ו, ט״ז
  function heNum(n) {
    const U = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"], T = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"], H = ["", "ק", "ר", "ש", "ת"];
    let s = ""; n = Math.max(1, Math.floor(n));
    while (n >= 400) { s += "ת"; n -= 400; }
    if (n >= 100) { s += H[Math.floor(n / 100)]; n %= 100; }
    if (n === 15) s += "טו"; else if (n === 16) s += "טז"; else { s += T[Math.floor(n / 10)] + U[n % 10]; }
    return s.length > 1 ? s.slice(0, -1) + "״" + s.slice(-1) : s + "׳";
  }
  const lum = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return 0.3;
    const v = parseInt(m[1], 16), c = [v >> 16 & 255, v >> 8 & 255, v & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };

  // every face and weight a layout uses must be loaded before measuring, or the text reflows afterwards and clips
  let fontsOk = null;
  function loadFonts() {
    if (fontsOk) return fontsOk;
    if (!document.fonts || !document.fonts.load) return (fontsOk = Promise.resolve());
    const fams = ["EB Garamond", "Frank Ruhl Libre", "Atkinson Hyperlegible", "Cormorant Garamond", "Instrument Serif", "Bricolage Grotesque", "Figtree"], jobs = [];
    for (const f of fams) for (const st of ["normal", "italic"]) for (const w of [400, 500, 600, 700, 800])
      jobs.push(document.fonts.load(`${st} ${w} 12px "${f}"`, "Aaḥ’א").catch(() => null));
    return (fontsOk = Promise.all(jobs).then(() => document.fonts.ready));
  }

  /* ---------- the paginator ---------- */
  const fits = box => box.scrollHeight <= box.clientHeight + 1;
  const SPLIT = new Set(["P", "LI", "BLOCKQUOTE", "OL", "UL", "DIV", "SPAN", "EM", "I", "B", "STRONG", "A", "SMALL", "U", "Q", "CITE", "FONT", "SECTION", "DL", "DD"]);
  const isHead = n => n && n.nodeType === 1 && (/^H[1-6]$/.test(n.tagName) || n.classList.contains("pp-h") || n.classList.contains("pp-chh"));
  const splittable = n => n.nodeType === 1 && SPLIT.has(n.tagName) && !isHead(n) && !n.classList.contains("pp-keep") &&
    !(n.tagName === "P" && n.textContent.trim().length < 50);
  const lastEl = d => { let c = d.lastChild; while (c && c.nodeType === 3 && !c.data.trim()) c = c.previousSibling; return c; };
  const onlyHeads = d => { for (const c of d.childNodes) { if (c.nodeType === 3 ? c.data.trim() : !isHead(c)) return false; } return true; };
  function splitText(node, dst, box) {
    const s = node.data, ends = []; const re = /\S+\s*/g; let m;
    while ((m = re.exec(s))) ends.push(m.index + m[0].length);
    if (!ends.length) return "none";
    const t = document.createTextNode(""); dst.appendChild(t);
    let lo = 0, hi = ends.length;   // the most words that fit
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; t.data = s.slice(0, ends[mid - 1]); if (fits(box)) lo = mid; else hi = mid - 1; }
    if (!lo) { t.remove(); return "none"; }
    t.data = s.slice(0, ends[lo - 1]); node.data = s.slice(ends[lo - 1]);
    return "some";
  }
  function markSplit(part, rest) {
    if (part.tagName === "P") part.classList.add("pp-brk");
    if (rest.classList) rest.classList.add("pp-cont");
    if (part.tagName === "OL" && rest.tagName === "OL") {   // numbering carries on (footnotes carry their own value=)
      const st = +(part.getAttribute("start") || 1) + part.querySelectorAll(":scope>li:not(.pp-cont)").length;
      rest.setAttribute("start", st);
    }
  }
  // move src's children into dst while the box still fits: "all", "some" (filled, more to come) or "none"
  function fill(src, dst, box) {
    let moved = false;
    while (src.firstChild) {
      const c = src.firstChild;
      dst.appendChild(c);
      if (fits(box)) { moved = true; continue; }
      src.insertBefore(c, src.firstChild);
      let r = "none";
      if (c.nodeType === 3) r = splitText(c, dst, box);
      else if (splittable(c)) {
        const part = c.cloneNode(false); part.removeAttribute("id"); dst.appendChild(part);
        r = fill(c, part, box);
        if (r !== "none" && onlyHeads(part)) { while (part.lastChild) c.insertBefore(part.lastChild, c.firstChild); r = "none"; }
        if (r === "none") part.remove(); else markSplit(part, c);
      }
      if (r === "none" && moved) {   // keep with next: a heading left last in the box goes over with its text
        const last = lastEl(dst);
        if (last && isHead(last) && last !== dst.firstChild) src.insertBefore(last, src.firstChild);
      }
      return moved || r !== "none" ? "some" : "none";
    }
    return "all";
  }

  /* ---------- the job ---------- */
  class Job {
    constructor(doc, opts) {
      this.doc = doc; this.o = opts; this.s = ST[opts.style] || ST.classic;
      const P = PAPER[opts.paper] || PAPER.a4; this.P = P;
      const f = this.s.formats.includes(opts.format) ? opts.format : this.s.formats[0]; this.format = f;
      if (f === "booklet") { this.pw = P.h / 2; this.ph = P.w; this.sw = P.h; this.sh = P.w; }
      else if (f === "cards") { this.pw = P.w / 2; this.ph = P.h / 2; this.sw = P.w; this.sh = P.h; }
      else if (f === "trifold") { this.pw = P.h / 3; this.ph = P.w; this.sw = P.h; this.sh = P.w; }
      else { this.pw = P.w; this.ph = P.h; this.sw = P.w; this.sh = P.h; }
      this.landscape = this.sw > this.sh;
      const small = this.pw < 180;
      this.fs = this.s.fs[small ? 1 : 0];
      this.mx = f === "cards" ? 4 : f === "trifold" ? 7 : small ? 13 : (this.s.id === "large" ? 17 : 20);
      this.my = f === "cards" ? 4 : f === "trifold" ? 8 : small ? 12 : 17;
      const v = doc.vol || {}, dark = lum(v.c1) < .45;
      this.root = el("div", `pp-job ink-${opts.ink || "colour"}`);
      this.root.setAttribute("style", `--c1:${v.c1 || "#1f3a5f"};--c2:${v.c2 || "#c8743a"};--c3:${v.c3 || "#e9c46a"};--onc:${dark ? "#fff" : "#1f1b16"};--onc2:${dark ? "#f3e3b8" : "#5c4a2a"}`);
      this.meas = el("div", "pp-measure"); this.meas.appendChild(this.root); document.body.appendChild(this.meas);
      this.pages = [];      // {el, kind: cover|flow|back|blank, ch}
      this.queue = [];      // boxes waiting to be filled
      this.ch = null;       // chapter being poured
    }
    destroy() { this.meas.remove(); }
    page(extra = "", kind = "flow") {
      const p = el("div", `pp-page pp-s-${this.s.id} ${extra}`);
      p.style.cssText = `width:${this.pw}mm;height:${this.ph}mm;--fs:${this.fs}pt;--mx:${this.mx}mm;--my:${this.my}mm`;
      this.root.appendChild(p); this.pages.push({ el: p, kind, ch: this.ch });
      return p;
    }
    flowLang() { return this.doc.lang === "he" ? "he" : this.doc.lang === "es" || this.doc.lang === "pt" ? this.doc.lang : "en"; }
    box(parent) { const b = el("div", "pp-box pp-flow"); b.lang = this.flowLang(); parent.appendChild(b); return b; }
    head(p) {
      const c = this.ch || {}, vol = (c.vol && c.vol.short) || "";
      p.appendChild(el("div", "pp-head", `<span>${esc(vol)}${c.n ? ` · ${c.n}` : ""}</span><span>${esc(c.title || this.doc.title || "")}</span>`));
    }
    foot(p) { p.appendChild(el("div", "pp-foot", `<span class="pp-fl">Peninei Halakha · Rabbi Eliezer Melamed</span><span class="pp-n">0</span><span class="pp-fl"></span>`)); }
    // the opening of a chapter, in each style's own shape
    opener(c) {
      const ey = esc(c.eyebrow || ""), t = esc(c.title || ""), he = c.titleHe ? `<div class="he" lang="he" dir="rtl">${esc(c.titleHe)}</div>` : "";
      const note = c.note ? `<p class="pp-note">${c.note}</p>` : "";
      const v = c.vol || this.doc.vol || {};
      switch (this.s.id) {
        case "heritage": {
          const orn = `<div class="pp-orn"><i></i><b class="s"></b><b></b><b class="s"></b><i></i></div>`;
          const a = art(v.slug);
          return `${orn}${a ? `<div class="pp-medal"><div>${a}</div></div>` : ""}<div class="pp-open"><div class="ey">${ey}</div><h1>${t}</h1>${he}${note}</div>${orn}`;
        }
        case "azulejo": return `<div class="pp-tile"></div><div class="pp-open"><div class="ey">${ey}</div><h1>${t}</h1>${he}${note}</div>`;
        case "arch": return `<div class="pp-arch"><i></i><div><div class="ey">${ey}</div><h1>${t}</h1>${he}</div></div><div class="pp-band">${"<i></i>".repeat(30)}</div>${note ? `<div class="pp-open">${note}</div>` : ""}`;
        case "riso": return `<div class="pp-open"><span class="pp-dot"></span><span class="pp-big">${esc(c.n || "")}</span><div class="ey">${ey}</div><h1>${t}</h1>${he}${note}</div><div class="pp-rule"></div>`;
        default: return `<div class="pp-open"><div class="ey">${ey}</div><h1>${t}</h1>${he}${note}</div>`;
      }
    }
    // a chapter's title as a block inside a running flow (table sheet, tri-fold, side panels)
    chHead(c) {
      const d = el("div", "pp-chh", `<div class="ey">${esc(c.eyebrow || "")}</div><h2>${esc(c.title || "")}</h2>${c.titleHe ? `<div class="he" lang="he" dir="rtl">${esc(c.titleHe)}</div>` : ""}`);
      if (c.note) d.appendChild(el("p", "pp-note", c.note));
      return d;
    }
    colophon() {
      const d = this.doc, date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      return el("div", "pp-colophon pp-keep", `<p>From <i>Peninei Halakha</i> by Rabbi Eliezer Melamed, Yeshivat Har Bracha. Licensed CC BY 4.0; not for resale. ph.yhb.org.il</p>
        ${(d.credits || []).map(c => `<p>${c}</p>`).join("")}<p>Printed from Pearls on ${esc(date)}.</p>
        <p class="he" lang="he">פניני הלכה, הרב אליעזר מלמד, מכון הר ברכה</p>
        <p class="tr"><span lang="he" dir="rtl">דברי תורה · נא לשמור על קדושת הדף</span><br>Contains words of Torah. Please treat this page with respect.</p>`);
    }
    // a section as one splittable block
    secBlock(s, c, first) {   // s.title and s.he.title are HTML, made safe by the caller (printClean or esc)
      const he = s.dir === "rtl";
      const d = el("div", "pp-sec" + (he ? " pp-he" : ""));
      d.lang = s.lang || (he ? "he" : "en"); if (he) d.dir = "rtl";
      const num = this.s.id === "heritage" && !he ? `<em class="pp-hn" lang="he">${heNum(s.n)}</em>` : `<i>${esc(s.n)}</i>`;
      const title = s.title ? `<h3 class="pp-h">${num}${s.title}${s.ai ? `<span class="pp-ai" lang="en">AI</span>` : ""}</h3>` : "";
      d.innerHTML = title + s.html;
      if (first && this.s.id === "heritage" && !he) { const p = d.querySelector(":scope>p"); if (p) p.classList.add("pp-dc"); }
      if (s.he && this.doc.lang === "both") {
        const h = el("div", "pp-he pp-heb-under", `${s.he.title ? `<h3 class="pp-h">${s.he.title}</h3>` : ""}${s.he.html}`);
        h.lang = "he"; h.dir = "rtl"; d.appendChild(h);
      }
      return d;
    }
    srcFor(c, withHead) {
      const src = el("div");
      if (withHead) src.appendChild(this.chHead(c));
      c.secs.forEach((s, i) => src.appendChild(this.secBlock(s, c, i === 0)));
      return src;
    }
    async pour(src, next) {   // next() gives the box after this one
      let box = this.cur && this.cur.isConnected ? this.cur : next();
      for (;;) {
        const r = fill(src, box, box);
        if (r === "all") break;
        if (r === "none" && !box.firstChild) box.appendChild(src.firstChild);   // larger than a whole box: let it clip
        box = next();
        if (this.pages.length % 4 === 0) { await tick(); if (this.o.progress) this.o.progress(this.pages.length); }
      }
      this.cur = box;
    }

    /* ----- one page a sheet, or booklet pages: each chapter starts a page ----- */
    pageNext(opener) {
      if (this.queue.length) return this.queue.shift();
      const c = this.ch, p = this.page(), first = opener && !this.opened;
      if (this.s.id === "azulejo") { p.appendChild(el("div", "pp-tiles")); p.appendChild(el("div", "pp-panel")); }
      if (first) { this.opened = true; p.appendChild(el("div", "pp-top", this.opener(c))); }
      else this.head(p);
      const body = el("div", "pp-body" + ((this.s.cols || 1) > 1 ? " pp-colrule" : ""));
      p.appendChild(body);
      for (let i = 0; i < (this.s.cols || 1); i++) this.queue.push(this.box(body));
      this.foot(p);
      return this.queue.shift();
    }
    async pagesChapters() {
      const last = this.doc.chapters.length - 1, back = this.format === "booklet" && this.o.cover !== "none";
      for (const [i, c] of this.doc.chapters.entries()) {
        this.ch = c; this.opened = false; this.queue = []; this.cur = null;
        const nx = () => this.pageNext(true);
        if (this.s.sbs) await this.sbsChapter(c, nx);
        else { const src = this.srcFor(c, false); if (i === last && !back) src.appendChild(this.colophon()); await this.pour(src, nx); }
        if (this.s.sbs && i === last && !back) { const src = el("div"); src.appendChild(this.colophon()); await this.pour(src, nx); }
      }
    }
    async sbsChapter(c, next) {
      let box = next();
      for (const [i, s] of c.secs.entries()) {
        const en = this.secBlock({ ...s, he: null }, c, i === 0), heS = s.he ? this.secBlock({ n: s.n, title: s.he.title, html: s.he.html, dir: "rtl", lang: "he" }, c, false) : null;
        const sE = el("div"), sH = el("div"); sE.appendChild(en); if (heS) sH.appendChild(heS);
        for (;;) {
          const row = el("div", "pp-row"), cE = el("div", "pp-cell"), cH = el("div", "pp-cell pp-he");
          cE.lang = s.lang || "en"; cH.lang = "he"; cH.dir = "rtl"; row.append(cE, cH); box.appendChild(row);
          const rE = sE.firstChild ? fill(sE, cE, box) : "all";
          const rH = sH.firstChild ? fill(sH, cH, box) : "all";
          if (rE === "all" && rH === "all") break;
          if (!cE.firstChild && !cH.firstChild) { row.remove(); if (!box.firstChild) { cE.appendChild(sE.firstChild || sH.firstChild); box.appendChild(row); } }
          box = next();
          if (this.pages.length % 4 === 0) await tick();
        }
      }
      this.cur = box;
    }

    /* ----- the Shabbat table sheet: masthead, two columns and a side column, chapters running on ----- */
    tableNext() {
      if (this.queue.length) return this.queue.shift();
      const p = this.page(), d = this.doc, first = this.pages.length === 1, v = d.vol || {};
      if (first) {
        p.appendChild(el("div", "pp-mast", `<div class="ic">${art(v.slug)}</div><div><h1>${esc(d.tableTitle || "For the Shabbat table")}</h1><div class="dt">${esc(d.dateLine || "")}</div></div><div class="he" lang="he">לשולחן השבת</div>`));
        p.appendChild(el("div", "pp-strip", `<span>${esc(d.title || "")}</span><span>Peninei Halakha · Rabbi Eliezer Melamed</span>`));
      } else p.appendChild(el("div", "pp-mini", `<span>${esc(d.title || "")}</span><span>For the Shabbat table</span>`));
      const body = el("div", "pp-body"); p.appendChild(body);
      const m1 = this.box(body), m2 = this.box(body), side = el("div", "pp-side"); body.appendChild(side);
      if (first && d.extras) {
        const x = d.extras;
        if (x.daily) side.appendChild(el("div", "pp-tbox y", `<div class="k">The Daily Pearl · Shabbat</div><p><b>${esc(x.daily.ref)}</b></p>${(x.daily.items || []).map(t => `<p>${esc(t)}</p>`).join("")}`));
        if (x.cal) side.appendChild(el("div", "pp-tbox", `<div class="k">On the calendar</div><p><b>${esc(x.cal.name)}</b>${x.cal.he ? ` <span lang="he" dir="rtl">${esc(x.cal.he)}</span>` : ""}</p><p>${esc(x.cal.when || "")}</p>`));
      }
      const sb = this.box(side);
      p.appendChild(el("div", "pp-footband", `<span>From Peninei Halakha by Rabbi Eliezer Melamed, Yeshivat Har Bracha · CC BY 4.0</span><span class="pp-n">0</span>`));
      this.queue.push(m2, sb);
      return m1;
    }
    async tableChapters() {
      const nx = () => this.tableNext();
      for (const [i, c] of this.doc.chapters.entries()) {
        this.ch = c; const src = this.srcFor(c, true);
        if (i === this.doc.chapters.length - 1) src.appendChild(this.colophon());
        await this.pour(src, nx);
      }
    }

    /* ----- pocket cards: each section its own card ----- */
    card(c, s, cont) {
      const p = this.page();
      const v = c.vol || this.doc.vol || {}, a = art(v.slug);
      const card = el("div", "pp-card");
      card.innerHTML = `<div class="pp-cardhd"><div class="pp-svg">${a}</div><i>${esc(`${(v.short || "")} ${c.n || ""}${s ? ` · ${s.n}` : ""}${cont ? " · continued" : ""}`)}</i><b>${s ? s.title : esc(c.title)}</b></div>`;
      const body = el("div", "pp-body"); card.appendChild(body); const b = this.box(body);
      card.appendChild(el("div", "pp-cardft", `<span>Peninei Halakha</span><span class="pp-n">0</span>`));
      p.appendChild(card);
      return b;
    }
    async cardChapters() {
      if (this.o.cover !== "none") this.cover(this.o.cover === "illus");
      for (const c of this.doc.chapters) {
        this.ch = c;
        for (const [i, s] of c.secs.entries()) {
          const src = el("div"); const b = this.secBlock({ ...s, title: "" }, c, i === 0);
          if (i === 0 && c.note) src.appendChild(el("p", "pp-note", c.note));
          src.appendChild(b);
          let first = true; this.cur = null;
          await this.pour(src, () => { const x = this.card(c, s, !first); first = false; return x; });
        }
      }
      this.ch = null;
      const p = this.page("", "back"); const card = el("div", "pp-card"); const body = el("div", "pp-body"); body.appendChild(this.colophon());
      card.innerHTML = `<div class="pp-cardhd"><div class="pp-svg">${art((this.doc.vol || {}).slug)}</div><i>Peninei Halakha</i><b>${esc(this.doc.title || "")}</b></div>`;
      card.appendChild(body); p.appendChild(card);
    }

    /* ----- tri-fold: [flap | back | cover] outside, [1 | 2 | 3] inside, as many leaflets as it takes ----- */
    panelNext() {
      if (this.queue.length) return this.queue.shift();
      const p = this.page(); const body = el("div", "pp-body"); p.appendChild(body);
      return this.box(body);
    }
    async trifoldChapters() {
      const nx = () => this.panelNext();
      for (const [i, c] of this.doc.chapters.entries()) {
        this.ch = c; const src = this.srcFor(c, true);
        if (i === this.doc.chapters.length - 1) src.appendChild(this.colophon());
        await this.pour(src, nx);
      }
    }

    /* ----- covers ----- */
    cover(illus, label) {
      const d = this.doc, v = d.vol || {}, a = art(v.slug);
      const p = this.page(`pp-cover${illus ? " illus" : ""}`, "cover");
      p.innerHTML = `<div><div class="sm">Peninei Halakha · <span lang="he" dir="rtl">פניני הלכה</span></div><h1>${esc(d.title || "")}</h1>${d.heTitle ? `<div class="he" lang="he" dir="rtl">${esc(d.heTitle)}</div>` : ""}</div>
        ${a ? `<div class="pp-art">${a}</div>` : ""}
        <div><div class="sub">${esc(d.sub || "")}${label ? ` · ${esc(label)}` : ""}</div><div class="sub">Rabbi Eliezer Melamed · Yeshivat Har Bracha</div></div>`;
      return p;
    }
    backPage() { const p = this.page("pp-back", "back"); p.appendChild(this.colophon()); return p; }
    blank() { return this.page("pp-blank", "blank"); }

    /* ----- putting it together ----- */
    async run() {
      await loadFonts();
      const f = this.format, s = this.s.id;
      if (f === "cards") { await this.cardChapters(); return this.number(), this.impose(this.pages.map(x => x.el), 2, 2, "cards"); }
      if (f === "trifold") return this.trifold();
      if (s === "table") { await this.tableChapters(); this.number(); return this.impose(this.pages.map(x => x.el), 1, 1); }
      const coverPg = this.o.cover !== "none" ? this.cover(this.o.cover === "illus") : null;
      await this.pagesChapters();
      this.number();
      if (f === "pages") return this.impose(this.pages.map(x => x.el), 1, 1);
      return this.booklets(coverPg);
    }
    number() { let n = 0; for (const p of this.pages) if (p.kind === "flow") { n++; const e = p.el.querySelector(".pp-n"); if (e) e.textContent = n; } }
    impose(pages, cols, rows, kind) {   // pages in reading order onto sheets, cols x rows to a sheet
      const per = cols * rows, sheets = [];
      for (let i = 0; i < pages.length; i += per) {
        const sh = el("div", "pp-sheet"); sh.style.width = this.sw + "mm"; sh.style.height = this.sh + "mm";
        for (let j = 0; j < per; j++) { const p = pages[i + j]; if (p) sh.appendChild(p); else { const b = this.blank(); sh.appendChild(b.el || b); } }
        if (kind === "cards") { sh.appendChild(Object.assign(el("div", "pp-cut"), { style: `left:50%;top:0;bottom:0;border-left-width:.3mm` }));
          sh.appendChild(Object.assign(el("div", "pp-cut"), { style: `top:50%;left:0;right:0;border-top-width:.3mm` })); }
        sheets.push(sh);
      }
      return this.done(sheets, pages.length);
    }
    booklets(coverPg) {
      const flow = this.pages.filter(p => p.kind === "flow");
      // long jobs: several booklets, split between chapters, about 40 pages each
      const groups = []; let g = [];
      const chs = []; for (const p of flow) { if (!chs.length || chs[chs.length - 1].ch !== p.ch) chs.push({ ch: p.ch, pages: [] }); chs[chs.length - 1].pages.push(p.el); }
      for (const c of chs) { if (g.length && g.length + c.pages.length > 40) { groups.push(g); g = []; } g = g.concat(c.pages); }
      if (g.length) groups.push(g);
      const sheets = [], many = groups.length > 1 && flow.length > 48 ? groups : [flow.map(p => p.el)];
      many.forEach((pg, k) => {
        let list = pg.slice();
        if (coverPg) {
          const cv = k === 0 ? coverPg : this.cover(this.o.cover === "illus", `Booklet ${k + 1} of ${many.length}`);
          if (k === 0 && many.length > 1) { const sub = cv.querySelector(".sub"); if (sub) sub.textContent += ` · Booklet 1 of ${many.length}`; }
          list.unshift(cv);
        }
        const back = coverPg ? this.backPage() : null;
        while ((list.length + (back ? 1 : 0)) % 4) list.push(this.blank());
        if (back) list.push(back);
        const n = list.length;
        for (let s = 0; s < n / 4; s++) {
          for (const [L, R] of [[n - 2 * s, 1 + 2 * s], [2 + 2 * s, n - 1 - 2 * s]]) {
            const sh = el("div", "pp-sheet"); sh.style.width = this.sw + "mm"; sh.style.height = this.sh + "mm";
            sh.append(list[L - 1], list[R - 1]); sh.appendChild(Object.assign(el("div", "pp-fold"), { style: "left:50%" }));
            sheets.push(sh);
          }
        }
      });
      return this.done(sheets, flow.length, many.length);
    }
    trifold() {
      return (async () => {
        await this.trifoldChapters();
        const flow = this.pages.filter(p => p.kind === "flow").map(p => p.el), sheets = [];
        const leaflets = Math.max(1, Math.ceil(flow.length / 4));
        for (let k = 0; k < leaflets; k++) {
          const four = flow.slice(k * 4, k * 4 + 4); while (four.length < 4) four.push(this.blank());
          const cv = this.cover(this.o.cover === "illus", leaflets > 1 ? `Leaflet ${k + 1} of ${leaflets}` : "");
          cv.classList.add("pp-s-trifold");
          const back = this.page("pp-back", "back"); back.appendChild(el("div", "pp-colophon", `<p>From <i>Peninei Halakha</i> by Rabbi Eliezer Melamed, Yeshivat Har Bracha. CC BY 4.0; not for resale.</p><p class="tr"><span lang="he" dir="rtl">דברי תורה · נא לשמור על קדושת הדף</span><br>Contains words of Torah. Please treat with respect.</p>`));
          const out = el("div", "pp-sheet"), ins = el("div", "pp-sheet");
          for (const sh of [out, ins]) { sh.style.width = this.sw + "mm"; sh.style.height = this.sh + "mm"; }
          out.append(four[3], back, cv); ins.append(four[0], four[1], four[2]);
          for (const sh of [out, ins]) for (const x of ["33.333%", "66.667%"]) sh.appendChild(Object.assign(el("div", "pp-fold"), { style: `left:${x}` }));
          sheets.push(out, ins);
        }
        return this.done(sheets, flow.length, leaflets);
      })();
    }
    done(sheets, pages, parts = 1) {
      for (const sh of sheets) this.root.appendChild(sh);
      return { sheets, pages, parts, sheetW: this.sw, sheetH: this.sh, landscape: this.landscape, paper: this.o.paper === "letter" ? "letter" : "a4", format: this.format, style: this.s.id, root: this.root };
    }
  }

  async function build(doc, opts) {
    const j = new Job(doc, opts);
    const r = await j.run();
    r.root.remove(); j.meas.remove();
    return r;
  }

  /* ---------- the preview, and printing ---------- */
  const HELP = {
    pages: "Print it as it is: one page a side.",
    booklet: "Print double-sided, flipping on the <b>short edge</b>. Keep the sheets in order, fold the stack in half and staple at the fold.",
    cards: "Print single-sided, then cut along the dashed lines.",
    trifold: "Print double-sided, flipping on the <b>short edge</b>. Fold the right panel in first, then the left over it."
  };
  let current = null;
  function close() {
    if (!current) return;
    current.overlay.remove(); const pr = document.getElementById("pp-print"); if (pr) pr.remove();
    const st = document.getElementById("pp-page-style"); if (st) st.remove();
    window.removeEventListener("resize", current.fit);
    document.removeEventListener("keydown", current.key);
    current = null;
  }
  function printNow(r, title) {
    let pr = document.getElementById("pp-print"); if (pr) pr.remove();
    pr = el("div", r.root.className); pr.id = "pp-print"; pr.setAttribute("style", r.root.getAttribute("style") || "");
    for (const sh of r.sheets) { const c = sh.cloneNode(true); c.style.transform = ""; pr.appendChild(c); }
    document.body.appendChild(pr);
    let st = document.getElementById("pp-page-style"); if (!st) { st = el("style"); st.id = "pp-page-style"; document.head.appendChild(st); }
    st.textContent = `@page{size:${r.sheetW}mm ${r.sheetH}mm;margin:0}`;
    const N = window.PearlsNative;
    const name = `Pearls - ${title || "Peninei Halakha"}`.replace(/[\\/:*?"<>|]/g, "-");
    if (N && typeof N.print === "function") { try { N.print(name, !!r.landscape, r.paper); return; } catch (e) { /* fall back to the browser */ } }
    window.print();
  }
  async function open(doc, opts, hooks = {}) {
    close();
    const ov = el("div", "pp-overlay"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Print preview");
    ov.innerHTML = `<div class="pp-bar"><button class="pp-back" type="button">Back</button><div class="pp-t"><b>${esc(doc.title || "Print")}</b><span class="pp-sum">Laying out the pages…</span></div><button class="pp-go" type="button" disabled>Print</button></div>
      <div class="pp-help"></div><div class="pp-scroll"><div class="pp-busy">Laying out the pages…</div></div>`;
    document.body.appendChild(ov);
    const fit = () => {}, key = e => { if (e.key === "Escape") { close(); if (hooks.onClose) hooks.onClose(); } };
    current = { overlay: ov, fit, key }; document.addEventListener("keydown", key);
    ov.querySelector(".pp-back").onclick = () => { close(); if (hooks.onBack) hooks.onBack(); };
    let r;
    try {
      r = await build(doc, { ...opts, progress: n => { const b = ov.querySelector(".pp-busy"); if (b) b.textContent = `Laying out the pages… ${n}`; } });
    } catch (e) {
      ov.querySelector(".pp-scroll").innerHTML = `<div class="pp-busy">Couldn't lay out the pages (${esc(e.message || e)}).</div>`; return null;
    }
    if (!current || current.overlay !== ov) return r;   // closed meanwhile
    const wrapRoot = el("div", r.root.className); wrapRoot.setAttribute("style", r.root.getAttribute("style") || "");
    const scroll = ov.querySelector(".pp-scroll"); scroll.innerHTML = ""; scroll.appendChild(wrapRoot);
    const cap = (i) => r.format === "booklet" ? `Sheet ${Math.floor(i / 2) + 1} · ${i % 2 ? "back" : "front"}` : r.format === "trifold" ? `Leaflet ${Math.floor(i / 2) + 1} · ${i % 2 ? "inside" : "outside"}` : `Sheet ${i + 1}`;
    r.sheets.forEach((sh, i) => { const w = el("div", "pp-sheetwrap"); w.appendChild(el("div", "pp-cap", esc(cap(i)))); w.appendChild(sh); wrapRoot.appendChild(w); });
    current.fit = () => {
      const avail = Math.max(200, scroll.clientWidth - 24), px = r.sheetW * MM, sc = Math.min(1, avail / px);
      wrapRoot.querySelectorAll(".pp-sheetwrap").forEach(w => { w.style.width = px * sc + "px"; w.style.height = r.sheetH * MM * sc + 22 + "px"; const sh = w.querySelector(".pp-sheet"); sh.style.transform = `scale(${sc})`; });
    };
    current.fit(); window.addEventListener("resize", current.fit);
    const sheetsN = r.sheets.length, sideWord = r.format === "booklet" || r.format === "trifold" ? "sides" : "sheets";
    const paper = (PAPER[opts.paper] || PAPER.a4).name;
    ov.querySelector(".pp-sum").textContent = `${ST[r.style].name} · ${r.pages} page${r.pages === 1 ? "" : "s"} · ${r.format === "booklet" || r.format === "trifold" ? sheetsN / 2 : sheetsN} ${paper} sheet${(r.format === "booklet" || r.format === "trifold" ? sheetsN / 2 : sheetsN) === 1 ? "" : "s"}${r.parts > 1 ? ` · ${r.parts} ${r.format === "trifold" ? "leaflets" : "booklets"}` : ""}`;
    ov.querySelector(".pp-help").innerHTML = HELP[r.format] + (opts.ink === "colour" ? " For the warm look, print on cream paper." : "") + ` <span hidden>${sideWord}</span>`;
    const go = ov.querySelector(".pp-go"); go.disabled = false; go.onclick = () => printNow(r, doc.title);
    if (hooks.onReady) hooks.onReady(r);
    return r;
  }

  window.PEARLS_PRINT = { STYLES, PAPER, build, open, close, heNum, _fill: fill };
})();
