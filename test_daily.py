"""The Daily Pearl: the schedule against the catalogue, then the Home card and #daily in a browser.
Must end "daily pearl: N/N"."""
import os, json, subprocess, urllib.parse
from playwright.sync_api import sync_playwright
import make_test_bookmark
here = os.path.dirname(os.path.abspath(__file__))
shots = os.path.join(here, "shots"); os.makedirs(shots, exist_ok=True)
url = "file://" + os.path.join(here, "www", "index.html")
ok, total = 0, 0
def check(cond, label):
    global ok, total
    total += 1; ok += bool(cond); print(("ok  " if cond else "FAIL"), label)

# 1. the data, offline: every day decodes, the halakhot run in order, and every reference is a section Pearls has
js = r'''
global.window = {}; require("./www/catalog.js"); require("./www/catalog_he.js"); require("./www/daily-pearl.js");
const secs = {}; for (const v of window.PH_CATALOG.volumes.concat(window.PH_CATALOG_HE.volumes)) for (const c of v.chapters) secs[v.book + "-" + c.n] = c.sections;
const D = window.PH_DAILY, y = D.YEARS[0], out = { days: 0, bad: [], gaps: [] }; let prev = null;
for (let i = 0; ; i++) {
  const dt = new Date(Date.parse(y.start + "T12:00:00Z") + i * 864e5), d = D.forDate(dt); if (!d) break; out.days++;
  for (const p of d.parts) {
    const n = secs[p.book + "-" + p.ch]; if (!n || p.from > n || (p.to != null && p.to > n)) out.bad.push(d.iso + " " + JSON.stringify(p));
    if (prev && prev.book === p.book) { const exp = prev.to == null ? [prev.ch + 1, 1] : prev.to >= secs[prev.book + "-" + prev.ch] ? [prev.ch + 1, 1] : [prev.ch, prev.to + 1];
      if (exp[0] !== p.ch || exp[1] !== p.from) out.gaps.push(d.iso + " expected " + exp.join(":") + " got " + p.ch + ":" + p.from); }
    prev = p;
  }
}
out.nov5 = D.forDate(new Date("2026-11-05T09:00:00")).parts; out.after = D.forDate(new Date("2027-10-02T09:00:00"));
console.log(JSON.stringify(out));'''
r = json.loads(subprocess.check_output(["node", "-e", js], cwd=here))
check(r["days"] == 385, f"5787 has 385 days (got {r['days']})")
check(not r["bad"], f"every reference exists in the catalogue {r['bad'][:3]}")
# the bookmark's own two slips, and nothing else
check(sorted(r["gaps"]) == ["2026-09-30 expected 4:4 got 5:1", "2027-06-07 expected 9:12 got 9:11"], f"order follows the bookmark {r['gaps']}")
check(r["nov5"] == [{"book": "17", "ch": 11, "from": 12, "to": 13}], "5 Nov 2026 is Kashrut 11:12-13")
check(r["after"] is None, "no guess after the schedule ends")

# 2. finding next year's schedule: a stand-in bookmark for 5788 (make_test_bookmark.py) read by pdf-text.js
build = os.path.join(here, "build"); os.makedirs(build, exist_ok=True)
pdf88 = os.path.join(build, "bookmark-5788-test.pdf")
want88 = make_test_bookmark.make(pdf88, "2027-10-02", 355)
pdfbad = os.path.join(build, "bookmark-5788-wrongdates.pdf")
make_test_bookmark.make(pdfbad, "2027-10-03", 355)   # every date a day off
js = r'''
global.window = {}; for (const f of ["catalog", "catalog_he", "data", "calendar", "daily-pearl"]) require("./www/" + f + ".js");
const P = require("./www/pdf-text.js"), fs = require("fs"), D = window.PH_DAILY;
const books = Object.keys(window.PH_META).map(id => ({ id, he: window.PH_META[id].heb }));
(async () => {
  const out = {};
  const r = D.parseBookmark(await P.items(fs.readFileSync(process.argv[1])), "2027-10-02", books);
  out.days = r.days; out.count = r.count; out.issues = r.issues;
  const bad = D.parseBookmark(await P.items(fs.readFileSync(process.argv[2])), "2027-10-02", books);
  out.badIssues = bad.issues.length; out.badDays = bad.days;
  out.links = D.links('<a href="https://cdn1.yhb.org.il/uploads/%E2%80%8F%D7%A1%D7%99%D7%9E%D7%A0%D7%99%D7%99%D7%94-%E2%80%93-%D7%AA%D7%A9%D7%A4%D7%95.pdf"><svg></svg></a>' +
    '<a href="https://ph.yhb.org.il/wp-content/uploads/2026/07/סימנייה-–-תשפז.pdf" target="_blank">להורדת סימניית הלימוד - תשפ&quot;ז</a>' +
    '<a href="https://ph.yhb.org.il/wp-content/uploads/2021/02/סימניה-שבת.pdf">להורדת סימניית שבת</a>', "https://ph.yhb.org.il/pninayomit/").map(l => l.year);
  out.rh = [D.roshHashana(5788), D.roshHashana(5789)];
  console.log(JSON.stringify(out));
})();'''
r = json.loads(subprocess.check_output(["node", "-e", js, pdf88, pdfbad], cwd=here))
check(r["count"] == 355 and not r["issues"] and r["days"] == want88, f"pdf-text.js + parseBookmark read a bookmark PDF back to its schedule {r['issues'][:3]}")
check(r["badIssues"] > 0 and r["badDays"] is None, "a bookmark whose dates don't match the calendar is refused")
check(r["links"] == ["5786", "5787"], f"the bookmark links and their years are found on the Daily Pearl page {r['links']}")
check(r["rh"] == ["2027-10-02", "2028-09-21"], "Rosh Ha-shana from the Hebrew calendar")

PAGE = "https://ph.yhb.org.il/pninayomit/"
def proxy_route(pdf_path, hits):
    def handle(route):
        u = urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query).get("u", [""])[0]
        hits.append(u)
        if u == PAGE:
            return route.fulfill(status=200, content_type="text/html", body='<h3><a href="https://ph.yhb.org.il/wp-content/uploads/2026/07/סימנייה-–-תשפז.pdf">להורדת סימניית הלימוד - תשפ"ז</a></h3>'
                                 '<h3><a href="https://cdn1.yhb.org.il/uploads/bm-5788.pdf">להורדת סימניית הלימוד - תשפ"ח</a></h3>')
        if u.endswith("bm-5788.pdf"):
            return route.fulfill(status=200, content_type="application/pdf", body=open(pdf_path, "rb").read())
        return route.fulfill(status=404, body="")
    return handle

# 3. the app
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args=["--allow-file-access-from-files"])
    for clock, name in [("2026-11-05T08:00:00", "kashrut"), ("2027-01-10T08:00:00", "kashrut-b"), ("2027-04-12T08:00:00", "hafetzei"), ("2027-12-01T08:00:00", "after")]:
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg.clock.set_fixed_time(clock)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
        pg.goto(url); pg.wait_for_timeout(300)
        if pg.query_selector("#onbGo"):
            pg.click('#onbChips [data-tag="shabbat"]'); pg.click("#onbGo"); pg.wait_for_timeout(300)
        card = pg.query_selector(".panel.daily")
        check(card is not None, f"{name}: Home shows the Daily Pearl card")
        if name == "after":
            check("next one isn't in this version" in card.inner_text(), "after: says the schedule has ended, no guess")
            pg.close(); continue
        card.screenshot(path=f"{shots}/daily-card-{name}.png")
        rows = pg.eval_on_selector_all(".panel.daily .dprow[data-act]", "es=>es.map(e=>e.dataset.id+'#'+e.dataset.sec)")
        check(len(rows) >= 2, f"{name}: two halakhot, each opens its section {rows}")
        if name == "kashrut":
            check(rows == ["17-11#12", "17-11#13"], "kashrut: rows point at Kashrut 11 §12 and §13")
            pg.click(".panel.daily .btn.gold"); pg.wait_for_timeout(900)
            check(pg.evaluate("location.hash") == "#ch-17-11", "Read opens the chapter")
            pg.goto(url + "#daily"); pg.wait_for_timeout(300)
            check(pg.is_visible("text=Two halakhot") and len(pg.query_selector_all(".dprow")) >= 16, "#daily lists the week")
            pg.screenshot(path=f"{shots}/daily-week.png", full_page=True)
        pg.close()
    # the app finds the 5788 bookmark by itself a month before 5787 ends, keeps it, and Home uses it on 5 Oct 2027
    for pdf, name in [(pdf88, "good"), (pdfbad, "bad")]:
        ctx = b.new_context(viewport={"width": 390, "height": 844})
        ctx.add_init_script("window.PEARLS_PROXY = 'https://proxy.test/proxy?u=';")
        hits = []
        ctx.route("https://proxy.test/**", proxy_route(pdf, hits))
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.clock.set_fixed_time("2027-09-01T08:00:00")
        pg.goto(url); pg.wait_for_timeout(300)
        if pg.query_selector("#onbGo"):
            pg.click('#onbChips [data-tag="shabbat"]'); pg.click("#onbGo")
        pg.wait_for_timeout(7000)
        stored = pg.evaluate("JSON.parse(localStorage.getItem('pearls.dailyYears') || '[]')")
        if name == "bad":
            check(not stored and any(h.endswith("bm-5788.pdf") for h in hits), "a bookmark that doesn't check out is read and not kept")
            ctx.close(); continue
        check(len(stored) == 1 and stored[0]["year"] == "5788" and stored[0]["start"] == "2027-10-02" and stored[0]["days"] == want88,
              f"the app finds next year's bookmark on Peninei Halakha's page and keeps its schedule {hits}")
        n = len(hits); pg.reload(); pg.wait_for_timeout(6500)
        check(len(hits) == n, "it looks at most once a day")
        pg.clock.set_fixed_time("2027-10-05T08:00:00"); pg.goto(url); pg.wait_for_timeout(500)
        rows = pg.eval_on_selector_all(".panel.daily .dprow[data-act]", "es=>es.map(e=>e.dataset.id+'#'+e.dataset.sec)")
        check(rows == ["11-01#7", "11-01#8"], f"Home's card follows the schedule it found {rows}")
        pg.goto(url + "#daily"); pg.wait_for_timeout(300)
        check("by itself" in pg.inner_text(".dpget"), "#daily says where that schedule came from")
        ctx.close()
    b.close()
check(not errors, f"no page errors {errors[:3]}")
print(f"daily pearl: {ok}/{total}")
