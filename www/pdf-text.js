/* Pearls · a small PDF text reader, for one job: reading Peninei Halakha's yearly study bookmark (daily-pearl.js).
   PDF_TEXT.items(bytes) -> Promise<[pages: [{s, x, y, w}]]>, every run of text with where it starts on the page
   (x from the left, y from the top, in PDF points) and its width. Enough of PDF for that: classic and stream
   cross-references, incremental updates, Flate streams, Type0 (Identity-H) and simple fonts with ToUnicode maps,
   Form XObjects. Not a general PDF library: anything it doesn't understand is skipped, and the caller checks the
   result before trusting it. Needs DecompressionStream (Chrome 80, Safari 16.4); without it, items() rejects. */
(function () {
  const WS = c => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const DELIM = c => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  class Ref { constructor(n) { this.n = n; } }
  class Name { constructor(s) { this.s = s; } }
  class Op { constructor(s) { this.s = s; } }

  // One lexer for objects and content streams. b: Uint8Array.
  function Lexer(b, pos) { this.b = b; this.p = pos || 0; }
  Lexer.prototype.skip = function () {
    const b = this.b;
    for (;;) {
      while (this.p < b.length && WS(b[this.p])) this.p++;
      if (b[this.p] === 37) { while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++; continue; }
      return;
    }
  };
  Lexer.prototype.next = function () {   // -> value, Op, or undefined at the end; "]" ">>" come back as Op
    this.skip();
    const b = this.b; if (this.p >= b.length) return undefined;
    const c = b[this.p];
    if (c === 47) {   // /Name
      let s = ""; this.p++;
      while (this.p < b.length && !WS(b[this.p]) && !DELIM(b[this.p])) {
        if (b[this.p] === 35) { s += String.fromCharCode(parseInt(String.fromCharCode(b[this.p + 1], b[this.p + 2]), 16)); this.p += 3; }
        else s += String.fromCharCode(b[this.p++]);
      }
      return new Name(s);
    }
    if (c === 40) {   // (literal string) -> byte string
      let depth = 1, s = ""; this.p++;
      while (this.p < b.length) {
        let ch = b[this.p++];
        if (ch === 92) {
          ch = b[this.p++];
          const m = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 }[ch];
          if (m !== undefined) s += String.fromCharCode(m);
          else if (ch >= 48 && ch <= 55) {
            let o = ch - 48;
            for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k++) o = o * 8 + b[this.p++] - 48;
            s += String.fromCharCode(o & 255);
          } else if (ch === 13) { if (b[this.p] === 10) this.p++; }
          else if (ch !== 10) s += String.fromCharCode(ch);
          continue;
        }
        if (ch === 40) depth++;
        else if (ch === 41 && --depth === 0) break;
        s += String.fromCharCode(ch);
      }
      return { str: s };
    }
    if (c === 60 && b[this.p + 1] === 60) { this.p += 2; return this.dict(); }
    if (c === 60) {   // <hex>
      let h = ""; this.p++;
      while (this.p < b.length && b[this.p] !== 62) { const ch = b[this.p++]; if (!WS(ch)) h += String.fromCharCode(ch); }
      this.p++; if (h.length % 2) h += "0";
      let s = ""; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16));
      return { str: s };
    }
    if (c === 62 && b[this.p + 1] === 62) { this.p += 2; return new Op(">>"); }
    if (c === 91) { this.p++; const a = []; for (;;) { const v = this.next(); if (v === undefined || (v instanceof Op && v.s === "]")) return a; a.push(v); } }
    if (c === 93) { this.p++; return new Op("]"); }
    if (c === 123 || c === 125) { this.p++; return new Op(String.fromCharCode(c)); }
    let s = "";
    while (this.p < b.length && !WS(b[this.p]) && !DELIM(b[this.p])) s += String.fromCharCode(b[this.p++]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
      // "n g R" is a reference: look ahead without consuming if it isn't
      if (/^\d+$/.test(s)) {
        const save = this.p; this.skip();
        const m = /^(\d+)\s+R(?![^\s\/\[\]<>()%{}])/.exec(String.fromCharCode.apply(null, b.subarray(this.p, this.p + 16)));
        if (m) { this.p += m[0].length; return new Ref(+s); }
        this.p = save;
      }
      return +s;
    }
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null") return null;
    if (!s) { this.p++; return this.next(); }   // stray delimiter
    return new Op(s);
  };
  Lexer.prototype.dict = function () {
    const d = {};
    for (;;) {
      const k = this.next();
      if (k === undefined || (k instanceof Op && k.s === ">>")) return d;
      if (k instanceof Name) d[k.s] = this.next();
    }
  };

  const latin = b => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
  async function inflate(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("no DecompressionStream");
    for (const kind of ["deflate", "deflate-raw"]) {
      try {
        const src = kind === "deflate" ? bytes : bytes.subarray(2);
        const out = await new Response(new Blob([src]).stream().pipeThrough(new DecompressionStream(kind))).arrayBuffer();
        return new Uint8Array(out);
      } catch (e) { /* some writers leave junk after the data; try raw */ }
    }
    // last resort: read what inflates before an error
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader(), parts = [];
    try { for (;;) { const r = await reader.read(); if (r.done) break; parts.push(r.value); } } catch (e) { /* keep what we have */ }
    const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // The document: every object found by scanning for "n g obj" (later definitions win, which is how incremental
  // updates work), plus objects packed in object streams.
  async function open(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), text = latin(b), objs = new Map(), streams = [];
    const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
    while ((m = re.exec(text))) {
      const lx = new Lexer(b, m.index + m[0].length), v = lx.next();
      lx.skip();
      if (v && typeof v === "object" && !(v instanceof Ref) && !(v instanceof Name) && !Array.isArray(v) && text.startsWith("stream", lx.p)) {
        let s = lx.p + 6; if (b[s] === 13) s++; if (b[s] === 10) s++;
        let len = typeof v.Length === "number" ? v.Length : -1;
        if (len < 0 || text.substr(s + len, 30).indexOf("endstream") < 0) len = text.indexOf("endstream", s) - s;
        while (len > 0 && (b[s + len - 1] === 10 || b[s + len - 1] === 13) && text.substr(s + len, 9) !== "endstream") len--;
        objs.set(+m[1], { dict: v, raw: b.subarray(s, s + len) });
        if (v.Type instanceof Name && v.Type.s === "ObjStm") streams.push(+m[1]);
        re.lastIndex = s + Math.max(len, 0);
      } else objs.set(+m[1], v);
    }
    const doc = { objs, get: v => (v instanceof Ref ? objs.get(v.n) : v) };
    doc.data = async s => {
      if (!s || !s.raw) return new Uint8Array(0);
      if (s.data) return s.data;
      let f = doc.get(s.dict.Filter); f = Array.isArray(f) ? f.map(x => doc.get(x)) : f ? [f] : [];
      let d = s.raw;
      for (const x of f) {
        if (x.s === "FlateDecode" || x.s === "Fl") d = await inflate(d);
        else return (s.data = new Uint8Array(0));   // DCT images and the like: not text
      }
      const parms = doc.get(s.dict.DecodeParms);
      if (parms && doc.get(parms.Predictor) >= 10) d = unpredict(d, doc.get(parms.Columns) || 1);
      return (s.data = d);
    };
    for (const n of streams) {   // objects inside object streams, unless a later plain object replaced them
      const s = objs.get(n), d = await doc.data(s), first = doc.get(s.dict.First), N = doc.get(s.dict.N);
      const lx = new Lexer(d), hdr = [];
      for (let i = 0; i < N; i++) hdr.push([lx.next(), lx.next()]);
      for (const [num, off] of hdr) if (!objs.has(num)) objs.set(num, new Lexer(d, first + off).next());
    }
    // the root: the last trailer or cross-reference stream that names one
    let root = null; const tr = /trailer\s*<</g;
    while ((m = tr.exec(text))) { const d = new Lexer(b, m.index + m[0].length).dict(); if (d.Root) root = d.Root; }
    if (!root) for (const v of objs.values()) if (v && v.dict && v.dict.Type && v.dict.Type.s === "XRef" && v.dict.Root) root = v.dict.Root;
    if (!root) for (const v of objs.values()) if (v && v.Type && v.Type.s === "Catalog") root = v;
    doc.root = doc.get(root);
    return doc;
  }
  function unpredict(d, cols) {   // PNG predictors, as used by cross-reference and object streams
    const row = cols + 1, out = new Uint8Array((d.length / row | 0) * cols), prev = new Uint8Array(cols);
    for (let r = 0; r * row < d.length; r++) {
      const t = d[r * row];
      for (let i = 0; i < cols; i++) {
        const x = d[r * row + 1 + i], a = i ? out[r * cols + i - 1] : 0, up = prev[i], c = i ? prev[i - 1] : 0;
        let v = x;
        if (t === 1) v = x + a; else if (t === 2) v = x + up; else if (t === 3) v = x + ((a + up) >> 1);
        else if (t === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
        out[r * cols + i] = v & 255;
      }
      prev.set(out.subarray(r * cols, r * cols + cols));
    }
    return out;
  }

  function pages(doc) {   // in order, each with its inherited resources and media box
    const out = [], seen = new Set();
    (function walk(node, res, box) {
      node = doc.get(node); if (!node || seen.has(node)) return; seen.add(node);
      res = doc.get(node.Resources) || res; box = doc.get(node.MediaBox) || box;
      if (node.Kids) for (const k of doc.get(node.Kids)) walk(k, res, box);
      else out.push({ node, res, box: box.map(doc.get) });
    })(doc.root && doc.root.Pages, null, [0, 0, 612, 792]);
    return out;
  }

  // A font: how many bytes a code takes, what each code says, and how wide it is (in 1/1000 em).
  async function font(doc, f) {
    f = doc.get(f) || {};
    const type0 = f.Subtype && f.Subtype.s === "Type0", map = {};
    let bytes = type0 ? 2 : 1;
    const tu = doc.get(f.ToUnicode);
    if (tu && tu.raw) {
      const t = latin(await doc.data(tu));
      const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(t); if (cs) bytes = cs[1].length / 2;
      const hex = h => { let s = ""; for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16)); return s; };
      for (const blk of t.split("beginbfchar").slice(1)) {
        const body = blk.split("endbfchar")[0], re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g; let m;
        while ((m = re.exec(body))) map[parseInt(m[1], 16)] = hex(m[2]);
      }
      for (const blk of t.split("beginbfrange").slice(1)) {
        const body = blk.split("endbfrange")[0], re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g; let m;
        while ((m = re.exec(body))) {
          const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
          if (m[5] !== undefined) { const list = m[5].match(/<([0-9a-fA-F]*)>/g) || []; list.forEach((h, i) => { if (lo + i <= hi) map[lo + i] = hex(h.slice(1, -1)); }); }
          else { const base = hex(m[4]); for (let c = lo; c <= hi && c - lo < 65536; c++) map[c] = base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + c - lo); }
        }
      }
    }
    const widths = {}; let dw = 1000;
    if (type0) {
      const df = doc.get((doc.get(f.DescendantFonts) || [])[0]) || {};
      if (df.DW != null) dw = doc.get(df.DW);
      const w = (doc.get(df.W) || []).map(doc.get);
      for (let i = 0; i < w.length;) {
        if (Array.isArray(w[i + 1])) { w[i + 1].map(doc.get).forEach((x, k) => (widths[w[i] + k] = x)); i += 2; }
        else { for (let c = w[i]; c <= w[i + 1] && c - w[i] < 65536; c++) widths[c] = w[i + 2]; i += 3; }
      }
    } else {
      dw = 0; const first = doc.get(f.FirstChar) || 0;
      (doc.get(f.Widths) || []).map(doc.get).forEach((x, k) => (widths[first + k] = x));
      if (!tu) for (let c = 32; c < 127; c++) map[c] = String.fromCharCode(c);   // plain ASCII is the same in every simple encoding
    }
    return { bytes, map, w: c => (widths[c] != null ? widths[c] : dw) };
  }

  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

  async function pageItems(doc, pg) {
    const runs = [], fonts = new Map();
    async function run(content, res, ctm0) {
      const lx = new Lexer(content); let st = { ctm: ctm0, Tc: 0, Tw: 0, Th: 1, TL: 0, rise: 0, font: null, fs: 0 }; const stack = [];
      let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], args = [];
      const fontsRes = doc.get(res && res.Font) || {}, xo = doc.get(res && res.XObject) || {};
      const show = parts => {   // parts: strings and numbers (TJ)
        const f = st.font; if (!f) return;
        let s = "", start = null, x = 0;
        for (const p of parts) {
          if (typeof p === "number") { x -= p / 1000 * st.fs * st.Th; continue; }
          const str = p.str;
          for (let i = 0; i + f.bytes <= str.length; i += f.bytes) {
            let c = 0; for (let k = 0; k < f.bytes; k++) c = c * 256 + str.charCodeAt(i + k);
            if (start === null) start = x;
            s += f.map[c] != null ? f.map[c] : "";
            x += (f.w(c) / 1000 * st.fs + st.Tc + (f.bytes === 1 && c === 32 ? st.Tw : 0)) * st.Th;
          }
        }
        if (start === null) return;
        const m0 = mul([st.fs * st.Th, 0, 0, st.fs, 0, st.rise], mul(tm, st.ctm));
        const p0 = mul([1, 0, 0, 1, start / (st.fs * st.Th || 1), 0], m0), p1 = mul([1, 0, 0, 1, x / (st.fs * st.Th || 1), 0], m0);
        runs.push({ s, x: Math.min(p0[4], p1[4]), y: p0[5], w: Math.abs(p1[4] - p0[4]) });
        tm = mul([1, 0, 0, 1, x, 0], tm);
      };
      for (;;) {
        const v = lx.next(); if (v === undefined) break;
        if (!(v instanceof Op)) { args.push(v); continue; }
        const a = args; args = [];
        switch (v.s) {
          case "q": stack.push(Object.assign({}, st)); break;
          case "Q": if (stack.length) st = stack.pop(); break;
          case "cm": st.ctm = mul(a.slice(0, 6), st.ctm); break;
          case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
          case "Tf": {
            const key = a[0] && a[0].s, ref = fontsRes[key];
            if (!fonts.has(ref)) fonts.set(ref, await font(doc, ref));
            st.font = fonts.get(ref); st.fs = a[1]; break;
          }
          case "Tc": st.Tc = a[0]; break;
          case "Tw": st.Tw = a[0]; break;
          case "Tz": st.Th = a[0] / 100; break;
          case "TL": st.TL = a[0]; break;
          case "Ts": st.rise = a[0]; break;
          case "Td": tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
          case "TD": st.TL = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
          case "Tm": tlm = a.slice(0, 6); tm = tlm; break;
          case "T*": tlm = mul([1, 0, 0, 1, 0, -st.TL], tlm); tm = tlm; break;
          case "Tj": show([a[0]]); break;
          case "TJ": show(a[0] || []); break;
          case "'": tlm = mul([1, 0, 0, 1, 0, -st.TL], tlm); tm = tlm; show([a[0]]); break;
          case "\"": st.Tw = a[0]; st.Tc = a[1]; tlm = mul([1, 0, 0, 1, 0, -st.TL], tlm); tm = tlm; show([a[2]]); break;
          case "Do": {
            const x = doc.get(xo[a[0] && a[0].s]);
            if (x && x.dict && x.dict.Subtype && x.dict.Subtype.s === "Form") {
              const fm = (doc.get(x.dict.Matrix) || [1, 0, 0, 1, 0, 0]).map(doc.get);
              await run(await doc.data(x), doc.get(x.dict.Resources) || res, mul(fm, st.ctm));
            }
            break;
          }
          case "BI": {   // inline image: skip to EI
            const b = content; let p = lx.p;
            while (p < b.length - 2 && !(WS(b[p]) && b[p + 1] === 69 && b[p + 2] === 73 && (p + 3 >= b.length || WS(b[p + 3])))) p++;
            lx.p = p + 3; break;
          }
        }
      }
    }
    const cs = doc.get(pg.node.Contents), parts = Array.isArray(cs) ? cs.map(doc.get) : [cs];
    const datas = []; for (const p of parts) datas.push(await doc.data(p));
    const n = datas.reduce((a, d) => a + d.length + 1, 0), all = new Uint8Array(n); let o = 0;
    for (const d of datas) { all.set(d, o); o += d.length; all[o++] = 10; }
    await run(all, pg.res, [1, 0, 0, 1, 0, 0]);
    const top = pg.box[3];
    return runs.map(r => ({ s: r.s, x: r.x - pg.box[0], y: top - r.y, w: r.w }));
  }

  // Runs that continue one another on the same line become one item (as PDF viewers do when you select text).
  function join(runs) {
    const out = [];
    for (const r of runs) {
      const p = out[out.length - 1];
      if (p && Math.abs(p.y - r.y) < 1 && Math.abs(r.x - (p.x + p.w)) < 1.5) { p.s += r.s; p.w = r.x + r.w - p.x; }
      else if (p && Math.abs(p.y - r.y) < 1 && Math.abs(p.x - (r.x + r.w)) < 1.5) { p.s = r.s + p.s; p.w = p.x + p.w - r.x; p.x = r.x; }
      else out.push(Object.assign({}, r));
    }
    return out;
  }

  async function items(bytes) {
    const doc = await open(bytes); if (!doc.root) throw new Error("not a PDF this reader understands");
    const out = [];
    for (const pg of pages(doc)) out.push(join(await pageItems(doc, pg)));
    return out;
  }
  const api = { items };
  if (typeof window !== "undefined") window.PDF_TEXT = api;
  if (typeof module !== "undefined") module.exports = api;
})();
