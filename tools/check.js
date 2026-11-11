// Runs bench.js's engine headless against known numbers from the user's in-game screenshots.
const fs = require('fs'), vm = require('vm'), dir = process.argv[2];
const els = {};
const fakeEl = () => new Proxy({ classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], style: {}, showModal() {}, close() {} },
  { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = v; return true; } });
const store = {};
const ctx = {
  window: {}, console, Math, JSON, Object, Array, Set, Map, String, Number, Promise, setTimeout, clearTimeout, URL: { createObjectURL() {} }, Blob: function () {},
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  document: { querySelector: s => (els[s] ||= fakeEl()), addEventListener() {}, createElement: fakeEl },
  alert() {}, location: { hash: '', href: 'x', pathname: '', search: '' }, history: { replaceState() {} }, addEventListener() {},
};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(dir + '/data.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(dir + '/bench.js', 'utf8') + '\n;globalThis.__t={plan,stages,simulate,get S(){return S},IT,RC,nameOf,upgradeOf,comboOf};', ctx);
const T = ctx.__t, find = n => +Object.keys(T.IT).find(k => T.IT[k].n === n && (T.IT[k].f === 'Elyos' || T.IT[k].f === 'both'));
let bad = 0; const eq = (what, a, b) => { const ok = Math.abs(a - b) < 1e-6; if (!ok) bad++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + what + ': ' + a + (ok ? '' : ' expected ' + b)); };

const target = find('Splendent Wise Dragon Lord Longsword');
console.log('stages:', T.stages(target).map(s => s.kind + ':' + T.nameOf(s.id)).join(' -> '));
eq('stage count (Spl Orichalcum .. Spl Wise)', T.stages(target).length, 9);

// user state on 2026-11-09 after Splendent White (screenshot of the Wise recipe)
T.S.stock = { 'Splendent White Dragon Lord Longsword': 1, "Artisan's Splendent Orichalcum Longsword": 1, "Artisan's Ultimate Refining Stone": 8, 'Wrathful Ego': 5 };
T.S.buy = {}; T.S.prof = {};
const P = T.plan(target, 1, 'safe'), R = k => (P.raw[k] || { need: 0, miss: 0 });
eq('Wrathful Mind need', R('Wrathful Mind').need, 3);
eq('Wrathful Will need', R('Wrathful Will').need, 3);
eq('Wrathful Ego need (20+7)', R('Wrathful Ego').need, 27);
eq('Wrathful Ego short', R('Wrathful Ego').miss, 22);
eq('Radiant Orichalcum Ore (15+2)', R('Radiant Orichalcum Ore').need, 17);
eq('Radiant Odyle (9+3)', R('Radiant Odyle').need, 12);
eq("Balaur's Essence (62 horns x2)", R("Balaur's Essence").need, 124);
eq('Refining stone short (have 8, need 8)', R("Artisan's Ultimate Refining Stone").miss, 0);
console.log('crafts:', P.crafts.map(c => T.nameOf(T.RC[c.rid].p) + ' x' + c.n).join(', '));
const L = T.plan(target, 1, 'lucky');
eq('lucky: no Spl Wise upgrade -> Ego 20', (L.raw['Wrathful Ego'] || {}).need, 20);
const A = T.plan(target, 1, 'avg');
eq('avg Ego 20 + 0.75*7', (A.raw['Wrathful Ego'] || {}).need, 25.25);

// from scratch: 3 Artisan's Splendent needed (True, White, Wise)
T.S.stock = {};
const F = T.plan(target, 1, 'lucky');
eq('lucky from scratch: True needs 4 refining + White 5 + Wise 6', (F.raw["Artisan's Ultimate Refining Stone"] || {}).need, 15);
const sim = T.simulate(target, 1, 300);
console.log('sim avg crafts', sim.crafts.toFixed(1), 'combos', sim.combos.toFixed(2));
// a necklace and a bracelet also build a path
for (const n of ['Splendent Wise Dragon Lord Necklace', 'Pilgrim Bracelet', 'Splendent Wise Dragon Lord Boots', 'Splendent Wise Dragon Lord Orb'])
  console.log(n, '->', T.stages(find(n)).length, 'stages,', Object.keys(T.plan(find(n), 1, 'safe').raw).length, 'materials');
process.exit(bad ? 1 : 0);
