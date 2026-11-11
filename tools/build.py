"""Builds CraftTree/data.js + icons from aion2data.com (global client data).

Recipes/items: /raw JSON. Icons: recipe pages (cached). Material sources: /calc/recipes JSON.
Transfer (gear) input of the Dragon Lord upgrade recipes is not in the data; it is the
previous recipe's product in the same 6-recipe group (x01,x11..x15), confirmed in game.
"""
import json, os, re, sys, time, urllib.request, urllib.parse, collections, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = r"C:\Users\adjal\OneDrive\Desktop\AION2 Tools\CraftTree"
CACHE = os.path.join(HERE, "cache"); os.makedirs(CACHE, exist_ok=True)
ICONDIR = os.path.join(OUT, "icons", "game"); os.makedirs(ICONDIR, exist_ok=True)
UA = {"User-Agent": "CraftBench-local/1.0", "Accept-Encoding": "identity"}
GEAR = {"Longsword","Greatsword","Dagger","Mace","Guard","Bow","Staff","Spellbook","Orb",
        "Necklace","Earrings","Ring","Bracelet","Top","Legs","Helm","Pauldrons","Gloves","Shoes","Cloak"}

def get(url, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return open(p, encoding="utf-8").read()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                t = r.read().decode("utf-8")
            open(p, "w", encoding="utf-8").write(t)
            time.sleep(0.25)
            return t
        except Exception as e:
            err = e; time.sleep(2)
    print("FAIL", url, err, file=sys.stderr); return ""

R = json.load(open(os.path.join(HERE, "recipes.json"), encoding="utf-8"))
I = {x["id"]: x for x in json.load(open(os.path.join(HERE, "items.json"), encoding="utf-8"))["records"]}
build = R["clientVersion"]; recs = R["records"]

def cat(iid): return I.get(iid, {}).get("category", "")
keep = [r for r in recs if cat(r["product"]["id"]) in GEAR or cat(r["product"]["id"]) == "Crafting Material"]

# transfer input for the Dragon Lord groups
groups = collections.defaultdict(list)
for r in keep: groups[r["id"] // 100].append(r)
transfer = {}
for g, rs in groups.items():
    rs.sort(key=lambda r: r["id"])
    if len(rs) == 6 and [r["id"] % 100 for r in rs] == [1, 11, 12, 13, 14, 15]:
        for k in range(1, 6): transfer[rs[k]["id"]] = rs[k - 1]["product"]["id"]

# ---- icons from recipe pages (skip pages whose items all have icons already)
icon = {}
link = re.compile(r'<a [^>]*href="/items/(\d+)[^"]*"[^>]*>(.{0,900}?)</a>', re.S)
def scan(html):
    for m in link.finditer(html):
        im = re.search(r'src="(/game/items/[^"]+)"', m.group(2))
        if im: icon.setdefault(int(m.group(1)), im.group(1))
order = sorted(keep, key=lambda r: (r["id"] % 100 not in (1, 12, 14), r["id"]))  # combo pages first
for i, r in enumerate(order):
    ids = [r["product"]["id"]] + [m["id"] for m in r["materials"]] + ([r["combo"]["id"]] if r.get("combo") else [])
    if all(x in icon for x in ids): continue
    scan(get(r["url"], f"rec_{r['id']}.html"))
    if i % 25 == 0: print("pages", i, "/", len(order), "icons", len(icon), flush=True)

# ---- material sources ("How to get") from the shopping-list calculator
produced = {r["product"]["id"] for r in keep} | {r["combo"]["id"] for r in keep if r.get("combo")}
need_src = {m["name"] for r in keep for m in r["materials"] if m["id"] not in produced}
src = {}
for r in sorted(keep, key=lambda r: r["id"]):
    if need_src <= set(src): break
    if not ({m["name"] for m in r["materials"]} - set(src)) & need_src: continue
    q = urllib.parse.urlencode({"item": r["product"]["name"], "n": 1, "format": "json"})
    t = get(f"https://aion2data.com/calc/recipes/{r['url'].rsplit('/', 1)[1]}?{q}", f"calc_{r['id']}.json")
    try:
        for tb in json.loads(t).get("tables", []):
            if tb.get("caption") == "Base materials":
                for row in tb["rows"]: src.setdefault(re.sub(r"\s*\(Bound\)$", "", row[0]), row[2])
    except Exception: pass
print("sources", len(src), "of", len(need_src), "missing:", sorted(need_src - set(src))[:20])

# ---- download icon files
def dl(path):
    fn = os.path.join(ICONDIR, os.path.basename(path))
    if os.path.exists(fn): return
    with urllib.request.urlopen(urllib.request.Request("https://aion2data.com" + path, headers=UA), timeout=40) as r:
        open(fn, "wb").write(r.read())
used = set()
items = {}
for r in keep:
    for x in [r["product"]] + r["materials"] + ([r["combo"]] if r.get("combo") else []):
        used.add(x["id"])
with cf.ThreadPoolExecutor(4) as ex:
    list(ex.map(dl, sorted({icon[i] for i in used if i in icon})))

for iid in sorted(used):
    it = I.get(iid, {"name": next((x["name"] for r in keep for x in [r["product"]] + r["materials"] if x["id"] == iid), str(iid))})
    d = {"n": it["name"], "g": it.get("grade", ""), "c": it.get("category", ""), "f": it.get("faction", "")}
    if it.get("itemLevel"): d["il"] = it["itemLevel"]
    if it.get("requiredLevel"): d["rl"] = it["requiredLevel"]
    if it.get("stats") and d["c"] in GEAR: d["st"] = it["stats"]
    if iid in icon: d["ic"] = "icons/game/" + os.path.basename(icon[iid])
    s = src.get(re.sub(r"\s*\(Bound\)$", "", it["name"]))
    if s: d["src"] = s
    items[iid] = d

rcp = {}
for r in keep:
    d = {"p": r["product"]["id"], "n": r["count"], "pr": r["profession"], "lv": r["proficiency"],
         "m": [[m["id"], m["count"]] for m in r["materials"]], "u": r["url"]}
    if r.get("successByGap"): d["s"] = [round(x, 1) for x in r["successByGap"]]
    if r.get("combo"): d["c"] = [r["combo"]["id"], r["combo"]["chance"], r["combo"].get("count", 1)]
    if r["id"] in transfer: d["t"] = transfer[r["id"]]
    rcp[r["id"]] = d

data = {"build": build, "source": "https://aion2data.com", "items": items, "recipes": rcp}
open(os.path.join(OUT, "data.js"), "w", encoding="utf-8").write(
    "// AION 2 crafting data from aion2data.com (global client " + build + "). Generated by build.py.\nwindow.A2=" +
    json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("items", len(items), "recipes", len(rcp), "icons", sum(1 for d in items.values() if "ic" in d),
      "transfer", len(transfer), "kb", os.path.getsize(os.path.join(OUT, "data.js")) // 1024)
