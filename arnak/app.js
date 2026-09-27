'use strict';

// Friendly names, as BGA labels them on the end-of-game stats table
const LABELS = {
  'PlayerELO': 'ELO after latest game', 'PlayerArenaPoints': 'Arena points',
  '3playerSnakegamesPlayed': 'Games sampled', 'AverageOppELO': 'Avg opponent ELO (SOS)',
  'FirstPlaceFreq': '1st place rate', 'SecondPlaceFreq': '2nd place rate', 'ThirdPlaceFreq': '3rd place rate',
  'reflexion_time': 'Thinking time', 'time_bonus_nbr': 'Time bonuses', 'reflexion_time_sd': 'Thinking time SD',
  'score-research': 'Score for research', 'score-temple': 'Score for temple', 'score-cards': 'Score for cards',
  'score-item': 'Score for items', 'score-art': 'Score for artifacts', 'score-fear': 'Score for fear',
  'score-idols': 'Score for idols', 'score-guardians': 'Score for guardians',
  'gained-coins': 'Coins gained', 'gained-compass': 'Compasses gained', 'gained-tablet': 'Tablets gained',
  'gained-arrowhead': 'Arrowheads gained', 'gained-jewel': 'Jewels gained', 'gained-idol': 'Idols gained',
  'idol-bonus': 'Idol bonuses used', 'idol-jewel': 'Idol jewel bonuses', 'idol-arrowhead': 'Idol arrowhead bonuses',
  'idol-tablet': 'Idol tablet bonuses', 'idol-coins': 'Idol coin + compass bonuses', 'idol-card': 'Idol card bonuses',
  'gained-item': 'Items gained', 'gained-art': 'Artifacts gained', 'gained-card': 'Cards gained',
  'gained-draw': 'Cards drawn', 'discarded': 'Cards discarded', 'played': 'Cards played',
  'cost-art': 'Total cost of artifacts', 'cost-item': 'Total cost of items', 'guardians': 'Guardians overcome',
  'guardians-1': 'Guardians overcome, 1', 'guardians-2': 'Guardians overcome, 2', 'guardians-3': 'Guardians overcome, 3',
  'guardians-4': 'Guardians overcome, 4', 'guardians-5': 'Guardians overcome, 5',
  'sites-activated': 'Sites activated', 'sites-activated-basic': 'Basic sites activated',
  'sites-activated-small': 'Small sites activated', 'sites-activated-big': 'Big sites activated',
  'sites-discovered': 'Sites discovered', 'sites-discovered-small': 'Small sites discovered',
  'sites-discovered-big': 'Big sites discovered', 'tokens-used': 'Research bonus tokens used',
  'book-step': 'Notebook track steps', 'glass-step': 'Magnifying glass steps', 'temple': 'Temple tiles',
  'temple-bronze': 'Bronze temple tiles', 'temple-silver': 'Silver temple tiles', 'temple-gold': 'Gold temple tiles',
  'assistant-activated': 'Assistants activated', 'assistant-activated-silver': 'Silver assistants activated',
  'assistant-activated-gold': 'Gold assistants activated', 'exiled': 'Cards exiled', 'gained-fear': 'Fear cards gained',
  'ave_player_score': 'Avg score', 'ave_opp_scores': 'Avg opponent score', 'differential': 'Score differential',
  'overcome/sites discovered': 'Guardians per site discovered', 'total resources': 'Weighted resources',
  'sos-pt diff aggregate': 'SOS × differential (rank)',
};

let D, byName, names;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(v, m) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
function tone(v, m) {
  const a = D.avg[m], s = D.stdev[m];
  if (v === null || v === undefined || a === null || s === null) return '';
  if (v > a + s) return 'good';
  if (v < a - s) return 'bad';
  return '';
}
function fmtDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function updatedText(p) {
  if (p.status === 'not_found') return `Not found on BGA (renamed or deleted) as of ${fmtDate(p.checked)}; stats no longer updated`;
  return p.scraped ? `Stats updated ${fmtDate(p.scraped)}` : 'Stats from the original Google Sheet (not rescraped yet)';
}
function metricCell(m) {
  return `<td class="metric" title="${esc(LABELS[m] || m)}">${esc(m)}</td>`;
}

// flags come from the flag-icons stylesheet (ISO 3166 codes, lowercase)
function flag(p) {
  const c = p.country;
  return c && /^[A-Za-z]{2}$/.test(c.code) ? `<span class="fi fi-${c.code.toLowerCase()}" title="${esc(c.name)}"></span>` : '';
}
function plink(p) {
  return `<button class="link" data-player="${esc(p.name)}">${flag(p)}${esc(p.name)}</button>`;
}

// ---- cosine similarity (SORTEDELO rows 71-72) ---------------------------
function similarities(name) {
  const vec = (p) => D.cosineMetrics.map((m) => p.v[m] ?? 0);
  const ref = vec(byName.get(name));
  const refNorm = Math.hypot(...ref);
  const raw = new Map();
  for (const p of D.players) {
    const x = vec(p);
    const denom = refNorm * Math.hypot(...x);
    raw.set(p.name, denom === 0 ? 0 : x.reduce((s, xi, i) => s + xi * ref[i], 0) / denom);
  }
  const vals = [...raw.values()];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const norm = new Map([...raw].map(([k, v]) => [k, hi === lo ? 0 : (v - lo) / (hi - lo)]));
  return { raw, norm };
}

// ---- Player analyzer (ARNAKPLAYERDROPDOWN) --------------------------------
function renderAnalyzer(name, manual) {
  const p = byName.get(name);
  if (!p) return;
  $('#player-select').value = name;
  const games = p.v['3playerSnakegamesPlayed'];
  const au = $('#a-updated');
  au.className = `player-updated${p.scraped && !p.status ? '' : ' stale'}`;
  const from = p.scraped ? `last updated <b>${fmtDate(p.scraped)}</b>` : 'from the original Google Sheet export';
  au.innerHTML = p.status === 'not_found'
    ? `<span class="badge bad">ACCOUNT NOT FOUND</span> Renamed or deleted on BGA (checked ${fmtDate(p.checked)}). Showing the last known stats, ${from}; no longer updated.`
    : p.scraped
    ? `Stats last updated <b>${fmtDate(p.scraped)}</b> · based on ${games ?? '?'} three-player Snake games`
    : `Stats from the original Google Sheet export · not rescraped yet (${games ?? '?'} games)`;
  if (p.country) au.innerHTML += ` · ${flag(p)}${esc(p.country.name)}`;
  const sims = similarities(name);
  const comps = [...sims.norm].filter(([n]) => n !== name).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  // default manual comparison: the highest-ELO player who isn't already on screen
  if (!manual || !byName.has(manual)) manual = D.players.find((x) => x.name !== name && !comps.includes(x.name)).name;
  $('#manual-select').value = manual;
  $('#manual-sim').textContent = `Similarity to ${name}: ${sims.norm.get(manual).toFixed(2)} normalized · ${sims.raw.get(manual).toFixed(4)} raw cosine`;

  // rank / count / elite badge
  const rm = D.rankMetric;
  $('#a-rank').textContent = p.rank ?? '–';
  $('#a-count').textContent = D.players.filter((x) => x.v[rm] !== null).length;
  const t = tone(p.v[rm], rm);
  $('#a-badge').innerHTML = t === 'good' ? '<span class="badge good">ELITE PLAYER</span>'
    : t === 'bad' ? '<span class="badge bad">SUBPAR PLAYER</span>' : '';

  // top 5 playcomps
  $('#a-comps tbody').innerHTML = comps.map((n) => `<tr><td>${byName.get(n).rank ?? ''}</td>
    <td>${plink(byName.get(n))}</td>
    <td class="num" title="raw cosine ${sims.raw.get(n).toFixed(4)}">${sims.norm.get(n).toFixed(2)}</td></tr>`).join('');

  // strengths / weaknesses (TEXTJOIN of columns N / O)
  const strong = [], weak = [];
  for (const m of D.metrics) {
    const rule = D.rules[m];
    if (!rule) continue;
    const tn = tone(p.v[m], m);
    if (tn === 'good') strong.push([rule[0], m]);
    if (tn === 'bad') weak.push([rule[1], m]);
  }
  const chips = (xs) => xs.length ? xs.map(([l, m]) => `<span title="${esc(m)}">${esc(l)}</span>`).join('')
    : '<span class="none">None</span>';
  $('#a-strengths').innerHTML = chips(strong);
  $('#a-weaknesses').innerHTML = chips(weak);

  // comparison grid
  const cols = [name, ...comps, manual].map((n) => byName.get(n));
  const head = `<thead><tr><th>metric</th>${cols.map((c, i) => {
    const cls = i === 0 ? 'sel' : i === cols.length - 1 ? 'sep' : '';
    const sub = i === 0 ? `#${c.rank ?? '–'}` : `#${c.rank ?? '–'} · sim ${sims.norm.get(c.name).toFixed(2)}`;
    const nm = i === 0 ? `${flag(c)}${esc(c.name)}` : plink(c);
    return `<th class="${cls}" title="${esc(updatedText(c))}">${nm}<span class="rk">${i === cols.length - 1 ? 'manual · ' : ''}${sub}</span></th>`;
  }).join('')}<th class="sep">AVE</th><th>STDEV</th></tr></thead>`;
  const body = D.metrics.map((m) => `<tr class="${D.derived.includes(m) ? 'derived' : ''}">${metricCell(m)}${
    cols.map((c, i) => `<td class="${tone(c.v[m], m)}${i === cols.length - 1 ? ' sep' : ''}">${fmt(c.v[m], m)}</td>`).join('')
  }<td class="sep ref">${fmt(D.avg[m], m === 'PlayerArenaPoints' ? m : '')}</td><td class="ref">${fmt(D.stdev[m], m === 'PlayerArenaPoints' ? m : '')}</td></tr>`).join('');
  $('#a-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

// ---- All players (SORTEDELO_Arnak_3playerSnake_St) ------------------------
const playersState = { metric: 'PlayerELO', filter: '' };
function renderPlayers() {
  const m0 = playersState.metric;
  const f = playersState.filter.trim().toLowerCase();
  const list = D.players.filter((p) => !f || p.name.toLowerCase().includes(f))
    .sort((a, b) => (b.v[m0] ?? -Infinity) - (a.v[m0] ?? -Infinity));
  $('#players-count').textContent = `${list.length} of ${D.players.length} players · ${D.eliteCount} elite`;
  const head = `<thead><tr><th>metric</th><th>ELITEAVE</th><th>AVERAGES</th><th>STDEV</th>${
    list.map((p, i) => `<th class="${i === 0 ? 'sep' : ''}" title="${esc(updatedText(p))}">${plink(p)}<span class="rk">#${p.rank ?? '–'}${p.status === 'not_found' ? ' · not on BGA' : ''}</span></th>`).join('')
  }</tr></thead>`;
  const body = D.metrics.map((m) => {
    const fm = m === 'PlayerArenaPoints' ? m : '';
    return `<tr class="${D.derived.includes(m) ? 'derived' : ''}${m === m0 ? ' sorted' : ''}">${metricCell(m)}
      <td class="${tone(D.eliteAvg[m], m)}">${fmt(D.eliteAvg[m], fm)}</td>
      <td class="ref">${fmt(D.avg[m], fm)}</td><td class="ref">${fmt(D.stdev[m], fm)}</td>${
      list.map((p, i) => `<td class="${tone(p.v[m], m)}${i === 0 ? ' sep' : ''}">${fmt(p.v[m], m)}</td>`).join('')
    }</tr>`;
  }).join('');
  $('#p-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

// ---- Top 3s (TOP3sINARNAKCATS) --------------------------------------------
function renderTop3() {
  const pair = (p, m) => `${plink(p)}: ${fmt(p.v[m], m)}`;
  $('#t-table tbody').innerHTML = D.top3Metrics.map((m) => {
    const have = D.players.filter((p) => p.v[m] !== null && p.v[m] !== undefined);
    const top = [...have].sort((a, b) => b.v[m] - a.v[m]).slice(0, 3);
    const bot = [...have].sort((a, b) => a.v[m] - b.v[m]).slice(0, 3);
    return `<tr>${metricCell(m)}<td>${top.map((p) => pair(p, m)).join(', ')}</td><td>${bot.map((p) => pair(p, m)).join(', ')}</td></tr>`;
  }).join('');
  const rm = D.rankMetric;
  $('#r-table tbody').innerHTML = D.players.filter((p) => p.rank).sort((a, b) => a.rank - b.rank)
    .map((p) => `<tr><td class="num">${p.rank}</td><td>${plink(p)}</td><td class="num">${fmt(p.v[rm], rm)}</td></tr>`).join('');
}

// ---- Nationalities ------------------------------------------------------------
function nationStats() {
  const groups = new Map();
  for (const p of D.players) {
    if (!p.country || !p.rank) continue;
    const g = groups.get(p.country.code) || { code: p.country.code, name: p.country.name, players: [] };
    g.players.push(p);
    groups.set(g.code, g);
  }
  const list = [...groups.values()].map((g) => {
    g.players.sort((a, b) => a.rank - b.rank);
    g.avg = g.players.reduce((s, p) => s + p.rank, 0) / g.players.length;
    g.best = g.players[0];
    return g;
  });
  list.sort((a, b) => a.avg - b.avg || b.players.length - a.players.length);
  list.forEach((g, i) => { g.avgPos = i + 1; });
  return list;
}
function renderNations(code) {
  const list = nationStats();
  const sel = list.find((g) => g.code === code);
  $('#nation-select').value = sel ? sel.code : '';
  const unknown = D.players.filter((p) => !p.country).length;
  $('#nations-note').textContent = `${list.length} countries · sorted by number of players; Rank = position by the average 3PL Snake rank of their players`
    + (unknown ? ` · ${unknown} players with no country yet` : '');
  const byCount = [...list].sort((a, b) => b.players.length - a.players.length || a.avg - b.avg);
  $('#n-table tbody').innerHTML = byCount.map((g) => `<tr class="${sel && g.code === sel.code ? 'picked' : ''}">
    <td class="num">${g.avgPos}</td>
    <td><a href="#nations/${esc(g.code)}">${flag(g.best)}${esc(g.name)}</a></td>
    <td class="num">${g.players.length}</td>
    <td class="num">${g.avg.toFixed(2)}</td>
    <td>${plink(g.best)} <span class="muted">#${g.best.rank}</span></td></tr>`).join('');
  const players = sel ? sel.players : D.players.filter((p) => p.rank).sort((a, b) => a.rank - b.rank);
  $('#np-title').textContent = sel ? `${sel.name}: ${sel.players.length} players, best to worst` : 'All players, best to worst';
  $('#np-table tbody').innerHTML = players.map((p, i) => `<tr>
    <td class="num">${p.rank}</td><td>${plink(p)}</td>
    <td>${p.country ? esc(p.country.name) : ''}</td>
    <td class="num">${fmt(p.v.PlayerELO)}</td>
    <td class="num">${fmt(p.v['3playerSnakegamesPlayed'])}</td>
    <td class="num">${fmt(p.v.FirstPlaceFreq)}</td>
    <td class="num">${fmt(p.v[D.rankMetric])}</td></tr>`).join('');
}

// ---- routing ----------------------------------------------------------------
function route() {
  const [tab = 'analyzer', a, b] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const t = ['analyzer', 'players', 'top3', 'nations', 'about'].includes(tab) ? tab : 'analyzer';
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${t}`; });
  document.querySelectorAll('.tabs a').forEach((l) => l.setAttribute('aria-selected', String(l.dataset.tab === t)));
  if (t === 'analyzer') {
    const def = byName.has('oHeyKong') ? 'oHeyKong' : D.players[0].name;
    renderAnalyzer(byName.has(a) ? a : def, b);
  }
  if (t === 'nations') renderNations(a);
}
function go(name, manual) {
  location.hash = ['analyzer', name, manual].filter(Boolean).map(encodeURIComponent).join('/');
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* storage unavailable */ }
  if (saved) document.documentElement.dataset.theme = saved;
  $('#theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });
}

async function main() {
  initTheme();
  try {
    D = await (await fetch('data/arnak.json', { cache: 'no-cache' })).json();
  } catch (e) {
    $('#loading').textContent = 'Could not load data/arnak.json. Has the build step run?';
    return;
  }
  byName = new Map(D.players.map((p) => [p.name, p]));
  names = D.players.map((p) => p.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  $('#player-list').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
  $('#sort-metric').innerHTML = D.metrics.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  $('#loading').remove();

  const dates = D.players.map((p) => p.scraped).filter(Boolean).sort();
  const fresh = dates.length;
  const latest = fresh ? fmtDate(dates[fresh - 1]) : null;
  $('#updated').textContent = latest
    ? `Last updated ${latest} · ${fresh} of ${D.players.length} players rescraped from BGA`
    : 'Showing stats from the original Google Sheet export';
  if (D.minGames) {
    $('#about-min').textContent = `Players with fewer than ${D.minGames} three-player Snake games are left out of every table, average, ranking and comparison, because their averages are too noisy (${D.hiddenCount} players currently).`;
  }
  const run = D.lastScrape;
  $('#about-run').textContent = (latest
    ? `Last updated ${latest}: ${fresh} of ${D.players.length} players have freshly scraped stats; the rest still show the original Google Sheet export.`
    : 'Showing the stats exported from the original Google Sheet; the first scrape has not finished a player yet.')
    + (run ? ` Last completed run: ${fmtDate(run.finished)} (${run.ok ?? run.attempted - run.errored} of ${run.attempted} players refreshed).` : '');

  $('#player-select').addEventListener('change', (e) => { if (byName.has(e.target.value)) go(e.target.value); });
  $('#manual-select').addEventListener('change', (e) => {
    if (byName.has(e.target.value)) go($('#player-select').value, e.target.value);
  });
  for (const id of ['#player-select', '#manual-select']) {
    $(id).addEventListener('focus', (e) => { e.target.dataset.prev = e.target.value; e.target.value = ''; });
    $(id).addEventListener('blur', (e) => { if (!byName.has(e.target.value)) e.target.value = e.target.dataset.prev || ''; });
  }
  $('#sort-metric').addEventListener('change', (e) => { playersState.metric = e.target.value; renderPlayers(); });
  $('#nation-select').innerHTML = '<option value="">All countries</option>' + nationStats()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => `<option value="${esc(g.code)}">${esc(g.name)} (${g.players.length})</option>`).join('');
  $('#nation-select').addEventListener('change', (e) => { location.hash = e.target.value ? `nations/${e.target.value}` : 'nations'; });
  $('#filter').addEventListener('input', (e) => { playersState.filter = e.target.value; renderPlayers(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-player]');
    if (b) { go(b.dataset.player); scrollTo({ top: 0 }); }
  });

  renderPlayers();
  renderTop3();
  addEventListener('hashchange', route);
  route();
}
main();
