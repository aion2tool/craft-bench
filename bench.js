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

// ---------------------------------------------------------------- target + path + bench
const STAT_KEEP = ['Min Attack','Max Attack','Attack','Magic Attack','Defense','Physical Defense','Magic Defense','Accuracy','Magic Accuracy','Critical Hit','Block','HP','MP','Evasion','Parry'];
function renderTarget() {
  const id = S.target, it = IT[id], st = stages(id), first = RC[st.length ? st[st.length - 1].rid : recipeFor(id)] || {};
  const stats = Object.entries(it.st || {}).filter(([k]) => STAT_KEEP.includes(k) || Object.keys(it.st).length <= 8).slice(0, 10);
  $('#target').innerHTML = `${icon(id, 'l')}<div><div class="meta">${CAT_LABEL[it.c] || it.c} · ${it.g} · ${it.f === 'both' ? 'Both factions' : it.f}</div>
    <h1>${nm(id)}</h1><div class="meta">Item Level <b>${it.il || '?'}</b> · requires level ${it.rl || '?'} · ${first.pr || ''}</div>
    <div class="stats">${stats.map(([k, v]) => `<span class="stat">${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div></div>
    <div class="make">Make<input id="make" type="number" min="1" value="${S.make}">${have(id) ? `<span class="badge b-done">YOU HAVE ${have(id)}</span>` : ''}</div>`;
  $('#make').onchange = e => { S.make = Math.max(1, +e.target.value || 1); upd(); };
}

function stageInfo(s, i, all) {
  const r = RC[s.rid], p = succ(s.rid), c = r.c ? r.c[1] : 0;
  const sure = '<span class="badge b-sure" title="This crafting is guaranteed to succeed">100%</span>';
  if (s.kind === 'up') return { badge: sure + '<span class="badge b-up">SPLENDENT UPGRADE</span>', ex: `Turn ${esc(nameOf(s.base))} into its Splendent version. Guaranteed to succeed. Skip it if your ${esc(nameOf(s.base))} craft came out Splendent (25% combo).` };
  if (s.kind === 'combo') return { badge: '<span class="badge b-combo">COMBO ONLY</span>', ex: `No upgrade recipe: craft ${esc(nameOf(s.base))} until the ${c}% combo turns it Splendent. About ${Math.round(1 / (c / 100 * p))} crafts on average.` };
  const g = gearInput(s.rid), comboTxt = r.c ? ` ${c}% chance it comes out as ${esc(nameOf(r.c[0]))}.` : '';
  const g100 = guaranteed(s.rid);
  return { badge: (g100 ? sure : '') + '<span class="badge b-craft">CRAFT</span>', ex: `${g ? `Uses ${esc(nameOf(g[0]))} as the transfer material. ` : ''}${g100 ? 'Guaranteed to succeed.' : `${Math.round(p * 100)}% success${S.prof[r.pr] ? '' : ' (set your proficiency in ⚙ Settings for real odds)'}.`}${comboTxt}` };
}

function renderPath() {
  const st = stages(S.target);
  // done: you have this stage's item or a later one
  let reached = -1;
  st.forEach((s, i) => { if (have(s.id)) reached = i; });
  const next = reached + 1;
  if (S.sel == null || !st.some(s => s.id === S.sel)) S.sel = (st[next] || st[st.length - 1] || {}).id;
  $('#pathHint').textContent = st.length ? (next >= st.length ? 'You have it!' : `Stage ${next + 1} of ${st.length} is next`) : '';
  const fold = reached >= 1 && !S.showDone;
  $('#path').innerHTML = (reached >= 1 ? `<li class="st done fold"><span class="dot">✓</span><div class="head" data-fold="1"><div class="t"><div class="nm">${reached + 1} stage${reached ? 's' : ''} done</div>
      <div class="ex">You already have ${esc(nameOf(st[reached].id))}, so everything before it is covered.</div></div><span class="badge b-done">${fold ? 'SHOW' : 'HIDE'}</span></div></li>` : '')
    + st.map((s, i) => {
    if (fold && i <= reached) return '';
    const info = stageInfo(s, i, st), done = i <= reached, isNext = i === next, sel = s.id === S.sel;
    return `<li class="st${done ? ' done' : ''}${isNext ? ' next' : ''}${sel ? ' sel' : ''}" data-id="${s.id}">
      <span class="dot">${done ? '✓' : i + 1}</span>
      <div class="head">${icon(s.id)}<div class="t"><div class="nm">${nm(s.id)}</div><div class="ex">${info.ex}</div></div>
        ${done ? '<span class="badge b-done">DONE</span>' : isNext ? '<span class="badge b-next">NEXT</span>' : ''}${info.badge}<span class="chev">${sel ? '▾' : '▸'}</span></div>
      ${sel ? bench(s) : ''}</li>`;
  }).join('') || '<li class="muted">No crafting recipe for this item.</li>';
}

let openSub = new Set();
function matRows(rid, mult, depth, transferFirst) {
  const r = RC[rid], rows = [];
  if (transferFirst && r.t) rows.push([r.t, 1, true]);
  for (const [m, x] of r.m) rows.push([m, x, false]);
  return rows.map(([m, x, tr]) => {
    const need = x * mult, h = have(m), short = h < need;
    const sub = upgradeOf[m] || recipeFor(m) || comboOf[m];
    const key = rid + ':' + m, open = openSub.has(key);
    const it = IT[m] || {}, how = sub ? (S.buy[norm(it.n)] ? 'Buying instead of crafting' : 'Crafted · click + to see its recipe') : (it.src || 'Gathered / drop / shop');
    const p = price(m);
    return `<div class="mrow" title="${esc(it.src || '')}">${sub && depth < 3 ? `<button class="exp" data-sub="${key}">${open ? '−' : '+'}</button>` : '<span></span>'}${icon(m)}
      <div style="min-width:0"><div class="nm">${tr ? '<span class="tag">Transfer Material</span>' : ''}${nm(m)}</div><div class="how">${esc(how)}</div></div>
      <div class="cnt${short ? ' short' : ''}"><label class="haveIn" title="How many you have"><input type="number" min="0" data-stock="${esc(norm(it.n))}" value="${h}"> / ${fmt(need)}</label>
        ${isGear(m) ? '' : `<label class="priceIn" title="Market price for one"><input type="number" min="0" data-price="${esc(norm(it.n))}" value="${p ?? ''}" placeholder="price"> K</label>`}
        ${short && p ? `<small>buy ≈ ${kina((need - h) * p)}</small>` : ''}</div></div>
      ${open && sub ? `<div class="sub">${matRows(upgradeOf[m] || recipeFor(m) || comboOf[m], up1(need / RC[upgradeOf[m] || recipeFor(m) || comboOf[m]].n), depth + 1, true)}</div>` : ''}`;
  }).join('');
}
function bench(s) {
  const rid = s.kind === 'combo' ? s.rid : s.rid, r = RC[rid], p = succ(rid);
  const canCraft = (r.t ? have(r.t) >= 1 : true) && r.m.every(([m, x]) => have(m) >= x);
  const odds = [];
  odds.push(guaranteed(rid) ? `<span class="odd good">Success <b>100% · guaranteed</b></span>`
    : `<span class="odd ${p >= .999 ? 'good' : 'warn'}">Success <b>${Math.round(p * 100)}%</b>${S.prof[r.pr] ? '' : ' (proficiency not set)'}</span>`);
  if (r.c) odds.push(`<span class="odd pink">Combo <b>${r.c[1]}%</b> → ${esc(nameOf(r.c[0]))}</span>`);
  odds.push(`<span class="odd">${esc(r.pr)} <b>${r.lv ? 'proficiency ' + r.lv : 'any proficiency'}</b></span>`);
  if (tooLow(rid)) odds.push(`<span class="odd warn"><b>Your proficiency is too low</b></span>`);
  const title = s.kind === 'combo' ? `Recipe: ${esc(nameOf(r.p))} (hope for the combo)` : `Recipe: ${esc(nameOf(r.p))}`;
  return `<div class="bench"><div class="bh">${title}<span class="grow"></span><a class="small" href="${r.u}" target="_blank">source ↗</a></div>
    <div class="odds">${odds.join('')}</div>
    ${matRows(rid, 1, 0, true)}
    <div class="act"><span class="note">${canCraft ? 'You have everything for one craft.' : 'Red = still missing. The cost panel adds it all up.'}</span>
      <button class="primary" data-did="${rid}" data-stage="${s.id}">✓ I crafted it in game</button></div></div>`;
}

// ---------------------------------------------------------------- side panel
function renderSide() {
  $('#modeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
  $('#modeTip').textContent = MODES[S.mode];
  const P = plan(S.target, S.make, S.mode), Ps = plan(S.target, S.make, 'safe'), Pl = plan(S.target, S.make, 'lucky'), Pa = plan(S.target, S.make, 'avg');
  const short = Object.entries(P.raw).filter(([, r]) => r.miss > 1e-9).sort((a, b) => (b[1].miss * (S.prices[b[0]] || 0)) - (a[1].miss * (S.prices[a[0]] || 0)));
  const priced = short.some(([k]) => S.prices[k] != null);
  $('#total').innerHTML = short.length && !priced ? `<div class="lbl">Kinah cost</div><div class="big" style="font-size:18px">Add market prices to see it</div>
    <div class="cmp">Type prices in <b>All materials</b>, or ⚙ Settings → Load Kisenal prices</div>`
    : short.length ? `<div class="lbl">Kinah to buy what you're missing</div><div class="big">${P.cost.toLocaleString()}</div>
    <div class="cmp">Safe <b>${kina(Ps.cost)}</b> · Average <b>${kina(Pa.cost)}</b> · Lucky <b>${kina(Pl.cost)}</b></div>`
    : `<div class="alldone">✓ You have every material you need${S.mode !== 'safe' ? ' (in this mode)' : ''}</div>`;
  $('#short').innerHTML = short.map(([k, r]) => { const p = S.prices[k], it = IT[r.id] || {};
    return `<div class="srow" title="${esc(it.src || '')}">${icon(r.id, 's')}<div style="min-width:0"><div class="nm">${nm(r.id)}</div><div class="how">${esc(it.src || '')}</div></div>
      <div class="r"><b>${fmt(up1(r.miss))}</b> short<small>${p != null ? kina(up1(r.miss) * p) : '<span style="color:#ffb14a">no price</span>'}</small>
        <label class="priceIn"><input type="number" min="0" data-price="${esc(k)}" value="${p ?? ''}" placeholder="price"> K</label></div></div>`; }).join('')
    + (P.noPrice.length ? `<div class="warnline">No price for: ${P.noPrice.map(esc).join(', ')} (not in the total)</div>` : '');
  // crafts to do
  $('#todo').innerHTML = P.crafts.map((c, i) => { const r = RC[c.rid], k = norm(nameOf(r.p)), isMat = !isGear(r.p);
    const verb = c.how === 'up' ? 'Upgrade to' : c.how === 'combo' ? 'Craft for combo:' : 'Craft';
    return `<li><span class="no">${i + 1}</span>${icon(c.how === 'combo' ? r.c[0] : r.p, 'xs')}<div style="min-width:0">${verb} ${nm(r.p)}
      <div class="k">${esc(r.pr)}${isMat ? ` · <button class="linkb" data-buy="${esc(k)}">buy instead</button>` : ''}</div></div><span class="x">×${fmt(S.mode === 'avg' ? Math.round(c.n * 10) / 10 : up1(c.n))}</span></li>`; }).join('')
    + Object.keys(S.buy).filter(k => S.buy[k]).map(k => `<li><span class="no">$</span><span></span><div>Buying <b>${esc(k)}</b> <div class="k"><button class="linkb" data-craft="${esc(k)}">craft it instead</button></div></div><span></span></li>`).join('')
    || '<li class="muted">Nothing to craft.</li>';
  // my materials: everything this item needs, base materials and the crafted pieces in between
  const rows = Object.entries(P.dem).filter(([k]) => k !== norm(nameOf(S.target)))
    .sort((a, b) => isGear(a[1].id) - isGear(b[1].id) || a[0].localeCompare(b[0]));
  $('#allMats').innerHTML = `<tr><th>Material</th><th>Need</th><th>Have</th><th>Status</th><th>Price</th></tr>` + rows.map(([k, d]) => {
    const raw = P.raw[k], h = S.stock[k] || 0, crafted = !raw;
    const st = raw ? (raw.miss > 1e-9 ? `<td class="miss">${fmt(up1(raw.miss))} short</td>` : '<td class="ok">✓</td>')
      : (d.need - h > 1e-9 ? `<td class="craft">craft ${fmt(up1(d.need - h))}</td>` : '<td class="ok">✓</td>');
    return `<tr><td><span class="mn">${icon(d.id, 'xs')}${nm(d.id)}</span></td><td>${fmt(up1(d.need))}</td>
      <td><input type="number" min="0" data-stock="${esc(k)}" value="${h}"></td>${st}
      <td>${isGear(d.id) ? '' : `<input class="p" type="number" min="0" data-price="${esc(k)}" value="${S.prices[k] ?? ''}" placeholder="—">`}</td></tr>`; }).join('')
    || '<tr><td class="muted">Nothing needed.</td></tr>';
}

// ---------------------------------------------------------------- render + events
function upd() { save(); render(); }
function render() {
  if (!S.target || !IT[S.target] || !facOk(S.target)) S.target = topOfCat(S.cat);
  renderBrowser(); renderTarget(); renderPath(); renderSide();
}
function toast(html, cls) {
  const t = $('#toast'); t.innerHTML = `<div class="tb ${cls || ''}">${html}</div>`; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}

$('#facSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.fac = b.dataset.f; S.target = null; S.sel = null; upd(); };
$('#search').oninput = () => renderBrowser();
$('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; $('#search').value = ''; S.cat = b.dataset.cat; S.target = topOfCat(S.cat); S.sel = null; openSub.clear(); upd(); };
$('#items').onclick = e => { const d = e.target.closest('[data-id]'); if (!d) return; S.target = +d.dataset.id; S.cat = IT[S.target].c; S.sel = null; openSub.clear(); upd(); };
$('#modeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.mode = b.dataset.m; upd(); };
$('#path').onclick = e => {
  const sub = e.target.closest('[data-sub]'); if (sub) { const k = sub.dataset.sub; openSub.has(k) ? openSub.delete(k) : openSub.add(k); renderPath(); return; }
  const did = e.target.closest('[data-did]'); if (did) { craftedDialog(+did.dataset.did); return; }
  if (e.target.closest('[data-fold]')) { S.showDone = !S.showDone; save(); renderPath(); return; }
  if (e.target.closest('.bench')) return;
  const li = e.target.closest('.st'); if (!li) return;
  S.sel = S.sel === +li.dataset.id ? -1 : +li.dataset.id; openSub.clear(); save(); renderPath();
};
$('#todo').onclick = e => {
  const b = e.target.closest('[data-buy]'); if (b) { S.buy[b.dataset.buy] = true; upd(); return; }
  const c = e.target.closest('[data-craft]'); if (c) { delete S.buy[c.dataset.craft]; upd(); }
};
// every Have / Price box on the page (bench rows, cost list, materials table, prices window)
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.stock, pk = e.target.dataset && e.target.dataset.price;
  if (k == null && pk == null) return;
  if (k != null) S.stock[k] = Math.max(0, +e.target.value || 0);
  if (pk != null) { if (e.target.value === '') delete S.prices[pk]; else S.prices[pk] = Math.max(0, +e.target.value || 0); }
  upd(); if ($('#pricesDlg').open) renderPrices();
});

// prices window: every material the current item needs, in one list
function renderPrices() {
  const P = plan(S.target, S.make, 'safe');
  const keys = Object.entries(P.dem).filter(([, d]) => !isGear(d.id)).sort((a, b) => !!P.raw[b[0]] - !!P.raw[a[0]] || a[0].localeCompare(b[0]));
  $('#priceNote2').value = S.priceNote || '';
  $('#priceList').innerHTML = keys.map(([k, d]) => `<label class="prow">${icon(d.id, 'xs')}<span class="pn">${nm(d.id)}${P.raw[k] ? '' : ' <span class="muted small">(craftable)</span>'}</span>
    <input type="number" min="0" data-price="${esc(k)}" value="${S.prices[k] ?? ''}" placeholder="Kinah each"></label>`).join('');
}
$('#pricesB').onclick = () => { renderPrices(); $('#pricesDlg').showModal(); };
$('#priceNote2').onchange = e => { S.priceNote = e.target.value; save(); };
$('#kisenalB2').onclick = () => { Object.assign(S.prices, KISENAL.prices); S.priceNote = KISENAL.note; upd(); renderPrices(); toast('Kisenal prices loaded', 'ok'); };

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
    dlg.close(); S.sel = null; upd();
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
const strip = p => { const { sel, showDone, ...keep } = p; return keep; };   // UI-only fields stay local
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
