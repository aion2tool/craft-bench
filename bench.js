'use strict';
/* Craft Bench: AION 2 crafting planner + simulator. Data: data.js (aion2data.com, global client). */
const D = window.A2, IT = D.items, RC = D.recipes;
const CATS = {
  Weapons: ['Longsword','Greatsword','Dagger','Mace','Guard','Bow','Staff','Spellbook','Orb'],
  Accessories: ['Necklace','Earrings','Ring','Bracelet'],
  Armor: ['Top','Helm','Pauldrons','Gloves','Legs','Shoes','Cloak'],
};
const CAT_LABEL = { Guard:'Shield', Top:'Chest', Legs:'Legs', Shoes:'Boots', Helm:'Helm' };
const GEAR = new Set(Object.values(CATS).flat());
const PROFS = ['Blacksmithing','Handicrafting','Armorsmithing','Alchemy'];
// Wrathful materials have no icon in the game files: crops from the user's screenshots.
const LOCAL_ICON = { 'Wrathful Mind':'icons/mind.png', 'Wrathful Will':'icons/will.png', 'Wrathful Ego':'icons/ego.png' };
const MODES = {
  safe:  'Plan for no combo luck: every Splendent upgrade is crafted. The amount you can count on.',
  avg:   'The average over many tries: 25% of the time a combo saves you the upgrade.',
  lucky: 'Every combo hits and every craft succeeds. The best case.',
};
const norm = n => String(n).replace(/\s*\(Bound\)$/, '');
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString();
const up1 = n => Math.ceil(n - 1e-9);
const kina = n => { n = Math.round(n); return n >= 1e6 ? (+(n / 1e6).toFixed(n >= 1e8 ? 1 : 2)).toLocaleString() + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString(); };

// ---------------------------------------------------------------- indexes
// The game files list some items under two ids (e.g. a recipe makes 110230102, the combo names 110230023):
// one id per name + faction, so the steps of a line connect.
{
  const first = {}, canon = {};
  for (const id of Object.keys(IT).sort((a, b) => a - b)) { const k = IT[id].n + '|' + (IT[id].f || ''); first[k] ??= +id; canon[id] = first[k]; }
  const c = id => canon[id] ?? id;
  for (const r of Object.values(RC)) { r.p = c(r.p); if (r.c) r.c[0] = c(r.c[0]); if (r.t) r.t = c(r.t); r.m = r.m.map(([m, x]) => [c(m), x]); }
}
const byProduct = {}, comboOf = {}, upgradeOf = {};
for (const [rid, r] of Object.entries(RC)) {
  (byProduct[r.p] ??= []).push(+rid);
  if (r.c) comboOf[r.c[0]] = +rid;
}
for (const [rid, r] of Object.entries(RC))
  if (r.t && comboOf[r.p] && RC[comboOf[r.p]].p === r.t) upgradeOf[r.p] = +rid;   // Splendent upgrade (transfer)
for (const k in byProduct) byProduct[k].sort((a, b) => RC[a].lv - RC[b].lv || RC[a].n - RC[b].n);

// ---------------------------------------------------------------- state (profiles)
// Everything is saved in this browser only. Each profile (a player or a character) has its own
// inventory, prices, proficiency and choices. Export/Import/Share move a profile between browsers.
const PKEY = 'aion2-bench-profiles', OLDKEY = 'aion2-bench-v1';
const KISENAL = { note: 'Kisenal (NA East) · 2026-11-09', prices: { 'Radiant Odyle': 1079998, 'Radiant Orichalcum Ore': 1179999, 'Wrathful Mind': 700000, 'Wrathful Will': 2199998,
  'Wrathful Ego': 4789000, "Artisan's Ultimate Refining Stone": 70000, "Balaur's Essence": 18000, 'Fine Thick Balaur Horn': 50000, 'Fine Hard Balaur Horn': 125000,
  'Fine Durable Balaur Horn': 100000, 'Moonstone Hammer': 6550, "Artisan's Refining Stone": 71000, 'Pure Odyle': 170000, 'Radiant Yggdrasil Log': 1000000,
  'Radiant Sapphire Gemstone': 974999, 'Radiant Diamond Gemstone': 950000, 'Radiant Ruby Gemstone': 1275000, 'Enhanced Thick Balaur Scale': 64982,
  'Enhanced Hard Balaur Scale': 103000, 'Enhanced Durable Balaur Scale': 80000 } };
const blank = name => ({ name, fac: 'Elyos', cat: 'Longsword', target: null, make: 1, mode: 'safe', stock: {}, prices: {}, prof: {}, buy: {}, sel: null, priceNote: '' });
const clean = (d, name) => {   // accept any saved/imported profile, fill in what's missing
  const p = Object.assign(blank(name || d.name || 'Player'), d || {});
  for (const k of ['stock', 'prices', 'prof', 'buy']) if (typeof p[k] !== 'object' || !p[k]) p[k] = {};
  p.fac = p.fac === 'Asmodian' ? 'Asmodian' : 'Elyos'; p.mode = MODES[p.mode] ? p.mode : 'safe';
  return p;
};
let PROF = null;
try { PROF = JSON.parse(localStorage.getItem(PKEY)); } catch (e) {}
if (!PROF || !PROF.list || !PROF.list.length) {
  PROF = { cur: 0, list: [], welcomed: false };
  try {   // this browser used the single-profile page before: keep it as the first profile
    const old = JSON.parse(localStorage.getItem(OLDKEY));
    if (old) { PROF.list.push(clean(old, 'Main')); PROF.welcomed = true; }
  } catch (e) {}
  if (!PROF.list.length) PROF.list.push(blank('Main'));
}
PROF.cur = Math.min(Math.max(0, PROF.cur | 0), PROF.list.length - 1);
PROF.list = PROF.list.map(p => clean(p));
let S = PROF.list[PROF.cur];
const save = () => { PROF.list[PROF.cur] = S; try { localStorage.setItem(PKEY, JSON.stringify(PROF)); } catch (e) {} };
const nameOf = id => IT[id] ? IT[id].n : String(id);
const have = id => Math.max(0, +S.stock[norm(nameOf(id))] || 0);
const price = id => S.prices[norm(nameOf(id))];

// ---------------------------------------------------------------- helpers
function icon(id, cls = '', qty) {
  const it = IT[id] || {}, n = norm(it.n || '?'), src = LOCAL_ICON[n] || it.ic;
  return `<span class="ic ${cls} g-${it.g || ''}">${src ? `<img src="${src}" alt="" loading="lazy">` : `<b>${esc(n[0])}</b>`}${qty != null ? `<span class="qty">${qty}</span>` : ''}</span>`;
}
const nm = id => `<span class="n-${(IT[id] || {}).g || 'Common'}">${esc(nameOf(id))}</span>`;
const facOk = id => { const f = (IT[id] || {}).f; return !f || f === 'both' || f === S.fac; };
const isGear = id => GEAR.has((IT[id] || {}).c);

/**
 * Guaranteed crafts: the Splendent upgrades, and every Gear Transfer craft that puts in a gold (Unique) piece,
 * i.e. True Dragon Lord onward (the game says "This crafting is guaranteed to succeed"). The data still lists a
 * success curve for some of them, which the game doesn't apply.
 */
function guaranteed(rid) {
  const r = RC[rid];
  if (!r.s || !r.s.length || r.t) return true;
  return r.m.some(([m]) => isGear(m) && (IT[m] || {}).g === 'Unique');
}
/** Success chance (0..1) of a recipe at your proficiency; 1 when guaranteed or proficiency isn't set. */
function succ(rid) {
  const r = RC[rid];
  if (guaranteed(rid)) return 1;
  const p = S.prof[r.pr];
  if (p === undefined || p === null || p === '') return 1;
  const gap = Math.max(0, Math.min(r.s.length - 1, +p - r.lv));
  return r.s[gap] / 100;
}
const tooLow = rid => { const p = S.prof[RC[rid].pr]; return p !== undefined && p !== '' && +p < RC[rid].lv; };
const gearInput = rid => { const r = RC[rid]; if (r.t) return [r.t, 1]; const g = r.m.find(([m]) => isGear(m)); return g || null; };
const recipeFor = id => (byProduct[id] || [])[0];

/** The stages from the first craft up to the target, each with how it's obtained. */
function stages(target) {
  const out = []; let cur = target, guard = 0;
  while (cur && guard++ < 20) {
    if (upgradeOf[cur]) { out.unshift({ id: cur, kind: 'up', rid: upgradeOf[cur], base: RC[upgradeOf[cur]].t, from: comboOf[cur] }); cur = RC[upgradeOf[cur]].t; continue; }
    const rid = recipeFor(cur);
    if (rid) { out.unshift({ id: cur, kind: 'craft', rid }); const g = gearInput(rid); cur = g ? g[0] : null; continue; }
    if (comboOf[cur]) { const cr = comboOf[cur]; out.unshift({ id: cur, kind: 'combo', rid: cr, base: RC[cr].p }); const g = gearInput(cr); cur = g ? g[0] : null; continue; }
    break;
  }
  return out;
}

// ---------------------------------------------------------------- plan (deterministic)
/**
 * Materials and crafts to make `qty` of `target` from what you have.
 * mode safe: no combo luck; avg: expected values; lucky: every combo hits, every craft succeeds.
 */
function plan(target, qty, mode) {
  const stock = { ...S.stock }, raw = {}, crafts = new Map(), dem = {};
  const take = (id, q) => { const k = norm(nameOf(id)), h = Math.max(0, stock[k] || 0), t = Math.min(h, q); stock[k] = h - t; return t; };
  const addCraft = (rid, n, how) => { const c = crafts.get(rid) || { rid, n: 0, how }; c.n += n; crafts.set(rid, c); };   // keeps first position: inputs before what uses them
  const addRaw = (id, q, miss) => { const k = norm(nameOf(id)); const r = raw[k] ||= { id, need: 0, miss: 0 }; r.need += q; r.miss += miss; };
  const rawLeaf = id => !upgradeOf[id] && !recipeFor(id) && !comboOf[id];
  function need(id, q, depth) {
    if (q <= 1e-9 || depth > 40) return;
    const k = norm(nameOf(id));
    if (depth) { const d = dem[k] ||= { id, need: 0 }; d.need += q; }
    if (S.buy[k] || rawLeaf(id)) { const t = take(id, q); addRaw(id, q, q - t); return; }
    const rem = q - take(id, q);
    if (rem <= 1e-9) return;
    const up = upgradeOf[id];
    if (up) {
      const r = RC[up], c = RC[comboOf[id]].c[1] / 100;
      const owned = Math.min(Math.max(0, stock[norm(nameOf(r.t))] || 0), rem);   // base already crafted: its combo is gone
      const f = mode === 'safe' ? 1 : mode === 'lucky' ? 0 : 1 - c;
      need(r.t, rem, depth + 1);
      const n = owned + (rem - owned) * f;
      if (n > 1e-9) { for (const [m, x] of r.m) need(m, x * n, depth + 1); addCraft(up, n, 'up'); }
      return;
    }
    const rid = recipeFor(id);
    if (rid) {
      const r = RC[rid], p = mode === 'lucky' ? 1 : succ(rid);
      const n = up1(rem / r.n) / p;
      if (r.t) need(r.t, n, depth + 1);
      for (const [m, x] of r.m) need(m, x * n, depth + 1);
      addCraft(rid, n, 'craft');
      return;
    }
    const cr = comboOf[id];
    if (cr) {   // combo only: craft the normal piece until the combo hits
      const r = RC[cr], p = mode === 'lucky' ? 1 : succ(cr), c = r.c[1] / 100;
      const per = mode === 'lucky' ? 1 : 1 / (c * p);   // average tries; stacking a 90% figure per tier would multiply into nonsense
      const n = rem * per;
      if (r.t) need(r.t, n, depth + 1);
      for (const [m, x] of r.m) need(m, x * n, depth + 1);
      addCraft(cr, n, 'combo');
    }
  }
  need(target, qty, 0);
  let cost = 0; const noPrice = [];
  for (const [k, r] of Object.entries(raw)) { if (r.miss <= 1e-9) continue; const p = S.prices[k]; if (p == null) noPrice.push(k); else cost += up1(r.miss) * p; }
  return { raw, crafts: [...crafts.values()], cost, noPrice, dem };
}

// ---------------------------------------------------------------- browser
function itemsOfCat(cat) {
  const ids = new Set();
  for (const r of Object.values(RC)) for (const id of [r.p, r.c && r.c[0]]) if (id && (IT[id] || {}).c === cat && facOk(id)) ids.add(id);
  return [...ids].sort((a, b) => (IT[b].il || 0) - (IT[a].il || 0) || (/^Splendent/.test(IT[b].n) - /^Splendent/.test(IT[a].n)) || IT[a].n.localeCompare(IT[b].n));
}
function topOfCat(cat) { return itemsOfCat(cat)[0]; }
function renderBrowser() {
  $('#facSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.f === S.fac));
  const q = $('#search').value.trim().toLowerCase();
  $('#cats').innerHTML = Object.entries(CATS).map(([g, cats]) => `<div class="catg">${g}</div><div class="chips">${cats.map(c => {
    const t = topOfCat(c); return `<button class="chip${c === S.cat && !q ? ' on' : ''}" data-cat="${c}">${t ? icon(t) : ''}${CAT_LABEL[c] || c}</button>`; }).join('')}</div>`).join('');
  let ids;
  if (q) { ids = []; for (const c of GEAR) ids.push(...itemsOfCat(c).filter(id => IT[id].n.toLowerCase().includes(q))); ids = ids.slice(0, 80); }
  else ids = itemsOfCat(S.cat);
  $('#items').innerHTML = ids.map(id => `<div class="it${id === S.target ? ' on' : ''}" data-id="${id}">${icon(id, 's')}<div><div class="nm">${nm(id)}</div>
    <div class="meta">${IT[id].c === 'Bracelet' ? 'Bracelet' : (CAT_LABEL[IT[id].c] || IT[id].c)} · iLv ${IT[id].il || '?'}${upgradeOf[id] ? ' · upgrade' : comboOf[id] && !recipeFor(id) ? ' · combo' : ''}</div></div>${have(id) ? `<span class="have">HAVE ${have(id)}</span>` : ''}</div>`).join('')
    || '<p class="muted small" style="padding:10px">Nothing found.</p>';
}

// ---------------------------------------------------------------- steps view
// The page is a row of boxes, one per craft, left to right like the in-game bench:
// [box: craft + its materials] -> [next box] -> ... and a "Total materials" tab.
function progress(st) { let reached = -1; st.forEach((s, i) => { if (have(s.id)) reached = i; }); return reached; }

function renderTop() {
  const id = S.target, it = IT[id], st = stages(id), reached = progress(st), next = reached + 1;
  const status = !st.length ? 'No crafting recipe for this item.'
    : next >= st.length ? '<b class="ok">✓ You have it</b>'
    : `Step <b>${next + 1}</b> of ${st.length}${reached >= 0 ? ` · you have ${nm(st[reached].id)}` : ''}`;
  $('#topCard').innerHTML = `${icon(id, 'l')}<div class="tt"><div class="meta">${CAT_LABEL[it.c] || it.c} · Item Level ${it.il || '?'}</div>
    <h1>${nm(id)}</h1><div class="status">${status}</div></div>`;
  document.querySelectorAll('#tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === (S.view || 'steps')));
  $('#showAllW').style.display = (S.view || 'steps') === 'steps' && reached >= 0 ? '' : 'none';
  $('#showAll').checked = !!S.showAll;
}

function stepTitle(s) {
  if (s.kind === 'up') return 'Splendent Upgrade';
  if (s.kind === 'combo') return 'Craft until Combo';
  return 'Craft';
}
function stepTip(s) {
  const r = RC[s.rid];
  if (s.kind === 'up') return `Skip this box if your ${esc(nameOf(s.base))} came out Splendent.`;
  if (s.kind === 'combo') return `Craft ${esc(nameOf(s.base))} until the 25% combo makes it Splendent (about 4 tries).`;
  if (r.c && upgradeOf[r.c[0]]) return `25% chance it comes out Splendent: then skip the next box.`;
  if (!guaranteed(s.rid)) return `Can fail${S.prof[r.pr] ? ` (${Math.round(succ(s.rid) * 100)}% at your proficiency)` : ''}.`;
  return '';
}
/** ✓ box: ticked = you have all of it. Ticking sets Have to the amount needed; unticking puts your old number back. */
function gotBox(k, need, h) {
  return `<label class="got" title="${h >= need ? 'You have enough. Untick to undo' : 'Tick if you have all ' + fmt(need)}"><input type="checkbox" data-got="${esc(k)}" data-need="${need}"${h >= need ? ' checked' : ''}><span></span></label>`;
}
function matLine(m, need, transfer) {
  const h = have(m), short = h < need, sub = !transfer && (recipeFor(m) && !isGear(m)) ? RC[recipeFor(m)] : null;
  return `<div class="ml${short ? ' short' : ''}">${icon(m, 's')}<div class="mn">${transfer ? '<span class="tag">Transfer Material</span>' : ''}${nm(m)}
      ${sub ? `<div class="subr">craft from ${sub.m.map(([x, n]) => `${n} ${esc(norm(nameOf(x)))}`).join(' + ')}</div>` : ''}</div>
    <div class="mc">${gotBox(norm(nameOf(m)), need, h)}${fmt(h)}/${fmt(need)}</div></div>`;
}
function stepCard(s, i, reached) {
  const r = RC[s.rid], done = i <= reached, isNext = i === reached + 1;
  const result = s.id, makes = s.kind === 'combo' ? r.p : s.id;
  const canCraft = (!r.t || have(r.t) >= 1) && r.m.every(([m, x]) => have(m) >= x);
  const sure = guaranteed(s.rid) ? '<span class="badge b-sure">100%</span>' : '';
  const tip = stepTip(s);
  return `<div class="box${done ? ' done' : ''}${isNext ? ' next' : ''}">
    <div class="bx-h"><span class="no">${done ? '✓' : i + 1}</span><span class="kind">${stepTitle(s)}</span>${sure}</div>
    <div class="bx-item">${icon(result, 'm')}<div><div class="bx-name">${nm(result)}</div>${makes !== result ? `<div class="muted small">by crafting ${esc(nameOf(makes))}</div>` : ''}</div></div>
    <div class="bx-sub">Crafting Materials</div>
    <div class="bx-mats">${r.t ? matLine(r.t, 1, true) : ''}${r.m.map(([m, x]) => matLine(m, x, false)).join('')}</div>
    ${tip ? `<div class="bx-tip">${tip}</div>` : ''}
    <div class="bx-f">${done ? '<span class="ok">✓ You have it</span>'
      : isNext ? `<span class="${canCraft ? 'ok' : 'warn'}">${canCraft ? 'Ready to craft' : 'Missing materials'}</span><button class="primary sm" data-did="${s.rid}">✓ I crafted it</button>`
      : '<span class="muted">Later</span>'}</div>
  </div>`;
}
function renderSteps() {
  const st = stages(S.target), reached = progress(st);
  if (!st.length) { $('#view').innerHTML = '<p class="muted">This item has no crafting recipe.</p>'; return; }
  if (reached >= st.length - 1) { $('#view').innerHTML = `<div class="box done big"><div class="bx-item">${icon(S.target, 'm')}<div><div class="bx-name">${nm(S.target)}</div><div class="ok">✓ You have it. Nothing left to craft.</div></div></div></div>`; return; }
  const from = S.showAll ? 0 : reached + 1;
  $('#view').innerHTML = `<div class="flow">${st.slice(from).map((s, k) => (k ? '<div class="arrow">➜</div>' : '') + stepCard(s, from + k, reached)).join('')}</div>`;
}

function renderTotals() {
  const P = plan(S.target, S.make, 'safe');
  const base = Object.entries(P.raw).sort((a, b) => (b[1].miss > 1e-9) - (a[1].miss > 1e-9) || a[0].localeCompare(b[0]));
  const made = Object.entries(P.dem).filter(([k, d]) => !P.raw[k] && k !== norm(nameOf(S.target)));
  const short = base.filter(([, r]) => r.miss > 1e-9), priced = short.filter(([k]) => S.prices[k] != null);
  const cost = priced.reduce((t, [k, r]) => t + up1(r.miss) * S.prices[k], 0);
  $('#view').innerHTML = `<div class="totals">
    <div class="sumline">${short.length ? `<span>You're missing <b>${short.length}</b> material${short.length > 1 ? 's' : ''}</span>` : '<span class="ok">✓ You have every base material</span>'}
      ${priced.length ? `<span class="kin">Buying them: <b>${cost.toLocaleString()}</b> Kinah${priced.length < short.length ? ` <span class="muted small">(${short.length - priced.length} without a price)</span>` : ''}</span>` : short.length ? '<span class="muted small">Type prices below to see the Kinah cost</span>' : ''}
      <span class="grow"></span><button class="ghost sm" id="kisenalT">Fill Kisenal prices</button></div>
    <table class="tm"><tr><th>Material</th><th>Need</th><th title="Tick if you have all of it">✓</th><th>Have</th><th>Short</th><th>Price each</th><th>Cost</th></tr>
    ${base.map(([k, r]) => { const p = S.prices[k], miss = up1(r.miss);
      return `<tr class="${miss ? 'sh' : ''}"><td><span class="mn">${icon(r.id, 'xs')}${nm(r.id)}</span><div class="src">${esc((IT[r.id] || {}).src || '')}</div></td><td>${fmt(up1(r.need))}</td>
        <td>${gotBox(k, up1(r.need), S.stock[k] || 0)}</td><td><input type="number" min="0" data-stock="${esc(k)}" value="${S.stock[k] || 0}"></td><td class="${miss ? 'miss' : 'ok'}">${miss ? fmt(miss) : '✓'}</td>
        <td><input class="p" type="number" min="0" data-price="${esc(k)}" value="${p ?? ''}" placeholder="—"></td><td class="kc">${miss && p != null ? kina(miss * p) : ''}</td></tr>`; }).join('')}</table>
    ${made.length ? `<h3>Crafted along the way</h3><table class="tm"><tr><th>Item</th><th>Need</th><th>✓</th><th>Have</th><th>To craft</th></tr>
      ${made.map(([k, d]) => { const h = S.stock[k] || 0, todo = up1(Math.max(0, d.need - h));
        return `<tr><td><span class="mn">${icon(d.id, 'xs')}${nm(d.id)}</span></td><td>${fmt(up1(d.need))}</td><td>${gotBox(k, up1(d.need), h)}</td><td><input type="number" min="0" data-stock="${esc(k)}" value="${h}"></td><td class="${todo ? 'craft' : 'ok'}">${todo ? todo : '✓'}</td></tr>`; }).join('')}</table>` : ''}
    <p class="muted small">Counts assume no lucky combos. Your numbers save automatically.</p></div>`;
  $('#kisenalT').onclick = () => { Object.assign(S.prices, KISENAL.prices); S.priceNote = KISENAL.note; upd(); toast('Kisenal prices filled in', 'ok'); };
}

// ---------------------------------------------------------------- render + events
function upd() { save(); render(); }
function render() {
  if (!S.target || !IT[S.target] || !facOk(S.target)) S.target = topOfCat(S.cat);
  renderBrowser(); renderTop();
  (S.view === 'total' ? renderTotals : renderSteps)();
}
function toast(html, cls) {
  const t = $('#toast'); t.innerHTML = `<div class="tb ${cls || ''}">${html}</div>`; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}

$('#facSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.fac = b.dataset.f; S.target = null; upd(); };
$('#search').oninput = () => renderBrowser();
$('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; $('#search').value = ''; S.cat = b.dataset.cat; S.target = topOfCat(S.cat); upd(); };
$('#items').onclick = e => { const d = e.target.closest('[data-id]'); if (!d) return; S.target = +d.dataset.id; S.cat = IT[S.target].c; upd(); };
$('#tabs').onclick = e => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; upd(); };
$('#showAll').onchange = e => { S.showAll = e.target.checked; upd(); };
$('#view').onclick = e => { const d = e.target.closest('[data-did]'); if (d) craftedDialog(+d.dataset.did); };
// every Have / Price box
document.addEventListener('change', e => {
  const got = e.target.dataset && e.target.dataset.got;
  if (got != null) {
    const need = +e.target.dataset.need || 0, prev = S.prevStock ||= {};
    if (e.target.checked) { prev[got] = S.stock[got] || 0; S.stock[got] = Math.max(S.stock[got] || 0, need); }
    else { const old = prev[got] ?? 0; S.stock[got] = old < need ? old : 0; delete prev[got]; }
    upd(); return;
  }
  const k = e.target.dataset && e.target.dataset.stock, pk = e.target.dataset && e.target.dataset.price;
  if (k == null && pk == null) return;
  if (k != null) S.stock[k] = Math.max(0, +e.target.value || 0);
  if (pk != null) { if (e.target.value === '') delete S.prices[pk]; else S.prices[pk] = Math.max(0, +e.target.value || 0); }
  upd();
});

// record a real craft: use up the materials, add what you got
function craftedDialog(rid) {
  const r = RC[rid], dlg = $('#crafted');
  $('#craftedTitle').textContent = `You crafted ${nameOf(r.p)} in game?`;
  $('#craftedTip').textContent = 'Pick what happened. The materials are taken from your Have counts and the result is added.';
  const opts = [['ok', `Got ${nameOf(r.p)}`]];
  if (r.c) opts.push(['combo', `Combo! Got ${nameOf(r.c[0])}`]);
  if (r.s) opts.push(['fail', 'It failed']);
  $('#craftedBtns').innerHTML = opts.map(([k, l]) => `<button class="${k === 'combo' ? 'primary' : ''}" data-res="${k}">${esc(l)}</button>`).join('');
  $('#craftedBtns').onclick = e => {
    const b = e.target.closest('[data-res]'); if (!b) return;
    const use = (id, q) => { const k = norm(nameOf(id)); S.stock[k] = Math.max(0, (S.stock[k] || 0) - q); };
    if (r.t) use(r.t, 1);
    for (const [m, x] of r.m) use(m, x);
    const res = b.dataset.res, got = res === 'combo' ? r.c[0] : res === 'ok' ? r.p : null;
    if (got) { const k = norm(nameOf(got)); S.stock[k] = (S.stock[k] || 0) + (res === 'combo' ? (r.c[2] || 1) : r.n); }
    dlg.close(); upd();
    toast(got ? `${icon(got, 's')} Added ${esc(nameOf(got))} to your inventory` : 'Materials used up', got ? (res === 'combo' ? 'combo' : 'ok') : 'fail');
  };
  dlg.showModal();
}

// dialogs
$('#helpB').onclick = () => $('#help').showModal();
$('#build').textContent = D.build;
$('#setB').onclick = () => {
  $('#profs').innerHTML = PROFS.map(p => `<label>${p}<input type="number" min="0" max="100" data-prof="${p}" value="${S.prof[p] ?? ''}" placeholder="not set"></label>`).join('');
  $('#priceNote').value = S.priceNote || '';
  $('#settings').showModal();
};
$('#profs').onchange = e => { const p = e.target.dataset.prof; if (!p) return; if (e.target.value === '') delete S.prof[p]; else S.prof[p] = Math.max(0, +e.target.value || 0); upd(); };
$('#priceNote').onchange = e => { S.priceNote = e.target.value; upd(); };
$('#kisenalB').onclick = () => { Object.assign(S.prices, KISENAL.prices); S.priceNote = KISENAL.note; $('#priceNote').value = S.priceNote; upd(); toast('Kisenal prices loaded', 'ok'); };
$('#clearPricesB').onclick = () => { if (!confirm('Remove every price in this profile?')) return; S.prices = {}; upd(); };

// ---------------------------------------------------------------- profiles, backup, share
const APP = 'craft-bench';
const strip = p => { const { sel, showDone, prevStock, ...keep } = p; return keep; };   // UI-only fields stay local
function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const fileName = n => 'craft-bench-' + String(n).replace(/[^\w-]+/g, '_').slice(0, 30) + '.json';
function addProfile(p, msg) {
  let name = p.name || 'Player', i = 2;
  while (PROF.list.some(x => x.name === name)) name = (p.name || 'Player') + ' ' + i++;
  PROF.list.push(clean(p, name)); PROF.cur = PROF.list.length - 1; S = PROF.list[PROF.cur];
  S.name = name; upd(); renderPeople(); toast(msg || `Profile "${esc(name)}" added`, 'ok');
}
/** Profiles in a backup file: our format, a single profile, or the old single-page backup. */
function profilesIn(d) {
  if (d && d.app === APP && Array.isArray(d.profiles)) return d.profiles;
  if (d && (d.stock || d.prices)) return [d];
  throw new Error('not a backup');
}
function renderPeople() {
  $('#who').textContent = S.name;
  $('#peopleList').innerHTML = PROF.list.map((p, i) => {
    const owned = Object.values(p.stock || {}).filter(v => v > 0).length;
    return `<div class="person${i === PROF.cur ? ' on' : ''}"><div class="pn"><b>${esc(p.name)}</b><span class="muted small">${p.fac} · ${owned} items · ${Object.keys(p.prices || {}).length} prices</span></div>
      ${i === PROF.cur ? '<span class="badge b-next">IN USE</span>' : `<button data-use="${i}">Use</button>`}
      <button class="ghost" data-ren="${i}" title="Rename">✎</button><button class="ghost" data-exp1="${i}" title="Export this profile">⤓</button>
      ${PROF.list.length > 1 ? `<button class="ghost" data-del="${i}" title="Delete">✕</button>` : ''}</div>`;
  }).join('');
}
$('#whoB').onclick = () => { renderPeople(); $('#people').showModal(); };
$('#peopleList').onclick = e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.use != null) { PROF.cur = +d.use; S = PROF.list[PROF.cur]; openSub.clear(); upd(); renderPeople(); toast(`Now using "${esc(S.name)}"`, 'ok'); }
  else if (d.ren != null) { const p = PROF.list[+d.ren], n = prompt('Profile name (player or character):', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 40); save(); renderPeople(); } }
  else if (d.del != null) {
    const k = +d.del, p = PROF.list[k];
    if (!confirm(`Delete profile "${p.name}" and its inventory? Export it first if you want to keep it.`)) return;
    PROF.list.splice(k, 1); if (PROF.cur >= k) PROF.cur = Math.max(0, PROF.cur - 1);
    S = PROF.list[PROF.cur]; upd(); renderPeople();
  }
  else if (d.exp1 != null) { const p = PROF.list[+d.exp1]; download(fileName(p.name), { app: APP, v: 1, exported: new Date().toISOString(), profiles: [strip(p)] }); }
};
$('#newProfB').onclick = () => { const n = prompt('Name for the new profile (player or character):', ''); if (n && n.trim()) addProfile(blank(n.trim().slice(0, 40))); };
$('#dupProfB').onclick = () => addProfile(JSON.parse(JSON.stringify({ ...S, name: S.name + ' copy' })));
$('#expB').onclick = () => download(fileName(S.name), { app: APP, v: 1, exported: new Date().toISOString(), profiles: [strip(S)] });
$('#expAllB').onclick = () => download('craft-bench-all-profiles.json', { app: APP, v: 1, exported: new Date().toISOString(), profiles: PROF.list.map(strip) });
for (const id of ['#impB', '#impB2', '#impB3', '#impB4']) { const b = $(id); if (b) b.onclick = () => $('#impF').click(); }
$('#impF').onchange = async e => {
  try {
    const list = profilesIn(JSON.parse(await e.target.files[0].text()));
    PROF.welcomed = true;
    if (list.length === 1 && confirm(`Load "${list[0].name || 'the backup'}" into the profile you're using ("${S.name}")?\n\nOK = replace this profile · Cancel = add it as a new profile`)) {
      S = clean(list[0], S.name); PROF.list[PROF.cur] = S; upd(); renderPeople(); toast('Backup loaded into this profile', 'ok');
    } else { for (const p of list) addProfile(p, `Imported ${list.length} profile${list.length > 1 ? 's' : ''}`); }
    if ($('#welcome').open) $('#welcome').close();
  } catch (_) { alert("That file isn't a Craft Bench backup."); }
  e.target.value = '';
};

// share link: the profile is packed into the address (#p=...); nothing is uploaded anywhere
const b64 = {
  enc: u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
};
async function pack(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (!window.CompressionStream) return 'j' + b64.enc(raw);
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return 'z' + b64.enc(new Uint8Array(buf));
}
async function unpack(s) {
  const bytes = b64.dec(s.slice(1));
  const raw = s[0] === 'z' ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
$('#shareB').onclick = async () => {
  const link = location.href.split('#')[0] + '#p=' + await pack(strip(S));
  try { await navigator.clipboard.writeText(link); toast('Share link copied: whoever opens it can load your setup as their own profile', 'ok'); }
  catch (_) { prompt('Copy this link:', link); }
};
async function openShared() {
  const m = location.hash.match(/^#p=([\w-]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const p = await unpack(m[1]);
    PROF.welcomed = true; save();
    if (confirm(`Load the shared setup "${p.name || 'Shared'}" (${Object.keys(p.stock || {}).length} items, ${Object.keys(p.prices || {}).length} prices) as a new profile?`))
      addProfile({ ...p, name: (p.name || 'Shared') + ' (shared)' });
  } catch (_) { alert('That share link is broken or incomplete.'); }
}

// first visit
$('#startB').onclick = () => {
  const n = $('#startName').value.trim(); if (n) S.name = n.slice(0, 40);
  S.fac = $('#startFac').value; S.target = null;
  if ($('#welcomeKisenal').checked) { Object.assign(S.prices, KISENAL.prices); S.priceNote = KISENAL.note; }
  PROF.welcomed = true; upd(); renderPeople(); $('#welcome').close();
};

if (S.target == null) { S.cat = 'Longsword'; S.target = itemsOfCat('Longsword')[0]; }
render(); renderPeople();
if (!PROF.welcomed && !location.hash.startsWith('#p=')) $('#welcome').showModal();
openShared();
window.addEventListener("hashchange", openShared);   // link pasted into a tab that already has the site open
