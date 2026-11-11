// Drives the page in headless Edge over CDP and checks the multi-user features.
const { spawn } = require('child_process');
const port = 9361, url = process.argv[2], prof = process.argv[3];
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = {};
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
let bad = 0; const check = (n, ok, v) => { if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' -> ' + JSON.stringify(v))); };
(async () => {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d); delete wait[d.id]; } };
  await send('Page.enable'); await send('Runtime.enable');
  const errors = []; ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
  await send('Page.navigate', { url }); await sleep(2500);

  check('welcome shown on first visit', await ev(`document.querySelector('#welcome').open`), false);
  await ev(`document.querySelector('#startName').value='Tester'; document.querySelector('#startFac').value='Asmodian'; document.querySelector('#welcomeKisenal').checked=true; document.querySelector('#startB').click(); 1`);
  check('start: name + faction + prices', await ev(`S.name==='Tester' && S.fac==='Asmodian' && S.prices['Wrathful Ego']===4789000 && !document.querySelector('#welcome').open`), await ev('JSON.stringify({n:S.name,f:S.fac})'));
  check('asmodian target is Ebony line', /Ebony|Star|Dark/.test(await ev(`IT[S.target].n`)), await ev(`IT[S.target].n`));
  check('header shows profile', await ev(`document.querySelector('#who').textContent`) === 'Tester', 0);
  await ev(`S.stock['Wrathful Ego']=7; upd(); 1`);
  // share link round trip
  const packed = await ev(`pack(strip(S))`);
  const back = await ev(`unpack(${JSON.stringify(packed)}).then(p=>p.name+'|'+p.fac+'|'+p.stock['Wrathful Ego'])`);
  check('share pack/unpack', back === 'Tester|Asmodian|7', back);
  console.log('     share link length', packed.length);
  // new profile is separate
  await ev(`addProfile(blank('Alt')); 1`);
  check('new profile empty + selected', await ev(`S.name==='Alt' && !S.stock['Wrathful Ego'] && PROF.list.length===2`), await ev('PROF.list.map(p=>p.name)'));
  await ev(`PROF.cur=0; S=PROF.list[0]; upd(); 1`);
  check('switch back keeps inventory', await ev(`S.stock['Wrathful Ego']===7`), 0);
  // import formats
  check('import our format', await ev(`profilesIn({app:'craft-bench',v:1,profiles:[{name:'X',stock:{a:1}}]}).length===1`), 0);
  check('import old single backup', await ev(`profilesIn({stock:{a:1},prices:{}}).length===1`), 0);
  check('reject junk', await ev(`(()=>{try{profilesIn({foo:1});return false}catch(e){return true}})()`), 0);
  // inline tracking + price entry
  await ev(`PROF.cur=0; S=PROF.list[0]; S.sel=null; upd(); 1`);
  const benchInput = await ev(`(()=>{const i=document.querySelector('.bench input[data-stock]'); if(!i) return null; i.value='3'; i.dispatchEvent(new Event('change',{bubbles:true})); return i.dataset.stock})()`);
  check('bench Have box updates inventory', benchInput && await ev(`S.stock[${JSON.stringify(benchInput || '')}]===3`), benchInput);
  const priceKey = await ev(`(()=>{const i=document.querySelector('.bench input[data-price]'); if(!i) return null; i.value='12345'; i.dispatchEvent(new Event('change',{bubbles:true})); return i.dataset.price})()`);
  check('bench Price box saves price', priceKey && await ev(`S.prices[${JSON.stringify(priceKey || '')}]===12345`), priceKey);
  await ev(`document.querySelector('#pricesB').click(); 1`);
  check('prices window lists materials', await ev(`document.querySelector('#pricesDlg').open && document.querySelectorAll('#priceList input').length>3`), await ev(`document.querySelectorAll('#priceList input').length`));
  await ev(`document.querySelector('#pricesDlg').close(); 1`);
  check('materials table shows crafted pieces', await ev(`document.querySelector('#allMats').textContent.includes('Balaur Horn')`), 0);
  check('no simulator left', await ev(`!document.querySelector('#simB') && !document.querySelector('[data-try]')`), 0);
  // persistence after reload
  await send('Page.reload'); await sleep(2000);
  check('saved after reload, no welcome again', await ev(`PROF.list.length===2 && !document.querySelector('#welcome').open`), await ev('PROF.list.map(p=>p.name)'));
  // shared link opens as a new profile (confirm auto-accepted)
  await ev(`window.confirm=()=>true; 1`);
  await send('Page.navigate', { url: url + '#p=' + packed }); await sleep(500);
  await ev(`window.confirm=()=>true; 1`); await sleep(2500);
  const names = await ev(`PROF.list.map(p=>p.name)`);
  check('opening share link adds profile', names.some(n => /shared/.test(n)) || names.length === 3, names);
  check('no JS errors', errors.length === 0, errors);
  edge.kill(); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); edge.kill(); process.exit(2); });
