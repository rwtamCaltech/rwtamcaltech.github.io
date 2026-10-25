'use strict';
/* NBA GM Rank: static front end. All scoring happens in gmrank/build.py; this renders data/*.json. */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = l => String(l || 'N/A').replace(/[ /]/g, '_');
const pill = l => `<span class="pill ${cls(l)}">${esc(l || 'N/A')}</span>`;
const fmt = (v, d = 1) => v == null ? '–' : (v > 0 ? '+' : '') + Number(v).toFixed(d);
const money = v => v == null ? '–' : '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1e3) + 'K');
const monthYear = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
const fmtDate = s => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); };
const CATS = { draft: 'Draft', signing: 'Signing', letgo: 'Let go', trade: 'Trade' };
const SUB_ORDER = ['draft', 'signing_initial', 'signing_resolved', 'letgo_initial', 'letgo_resolved', 'trade_initial', 'trade_resolved'];
const SUB_FIELD = { draft: 'headline', signing_initial: 'initial', signing_resolved: 'resolved', letgo_initial: 'initial', letgo_resolved: 'resolved', trade_initial: 'initial', trade_resolved: 'resolved' };
const MAIN_COLS = [['overall', 'Overall'], ['draft', 'Draft'], ['signing', 'Signings'], ['letgo', 'Let go'], ['trade', 'Trades']];

let S = null;              // summary.json
const cache = {};
const state = { metric: 'per_season', sortKey: 'overall', horizon: 'all', teamSort: 'overall', showInitial: false };
try { Object.assign(state, JSON.parse(localStorage.getItem('gmrank-state') || '{}')); } catch (e) { /* storage blocked */ }
const save = () => { try { localStorage.setItem('gmrank-state', JSON.stringify(state)); } catch (e) { /* ignore */ } };

async function getJSON(path) {
  if (!cache[path]) cache[path] = fetch(path, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
  return cache[path];
}

/* ---------- theme ---------- */
(function theme() {
  let t = null;
  try { t = localStorage.getItem('gmrank-theme'); } catch (e) { /* ignore */ }
  if (t) document.documentElement.dataset.theme = t;
  $('#theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('gmrank-theme', document.documentElement.dataset.theme); } catch (e) { /* ignore */ }
  });
})();

/* ---------- shared bits ---------- */
function scoreCell(block, metric) {
  if (!block || !block.count) return `<td class="num"><span class="muted">–</span></td>`;
  const v = block[metric];
  return `<td class="num" title="${esc(block.count)} moves · rank ${block.rank}/${block.of}"><div class="cell-score"><span class="strong">${fmt(v, metric === 'per_season' ? 2 : 1)}</span>${pill(block.rating)}</div></td>`;
}

function metricToggle() {
  return `<div class="seg" role="group" aria-label="Score shown">
    <button type="button" data-metric="per_season" class="${state.metric === 'per_season' ? 'on' : ''}">Per season</button>
    <button type="button" data-metric="total" class="${state.metric === 'total' ? 'on' : ''}">Total</button></div>`;
}

function bindMetric(view, rerender) {
  view.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { state.metric = b.dataset.metric; save(); rerender(); }));
}

function sortHead(key, label, current) {
  return `<th class="num sortable ${current === key ? 'sorted' : ''}" data-sort="${key}">${label}${current === key ? ' ▾' : ''}</th>`;
}

/* ---------- GM list ---------- */
function renderGMs() {
  const view = $('#view');
  const key = state.sortKey, metric = state.metric;
  const rows = [...S.gms].sort((a, b) => gmSortVal(b, key, metric) - gmSortVal(a, key, metric));
  view.innerHTML = `
    <h2>General managers</h2>
    <p class="lede">The 30 current lead basketball executives, ranked by the value of their moves with their current team (in % of cap × seasons). Click a GM for their full report.</p>
    <div class="toolbar">${metricToggle()}<span class="small muted">Sorted by ${esc(MAIN_COLS.find(c => c[0] === key)[1])}; click a column to sort.</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>GM</th><th class="hide-sm">Team</th><th class="num hide-sm">Since</th><th class="num hide-sm">Moves</th>
      ${MAIN_COLS.map(([k, l]) => sortHead(k, l, key)).join('')}</tr></thead>
      <tbody>${rows.map((g, i) => `
        <tr class="link" data-href="#gm/${g.team}">
          <td class="rank">${i + 1}</td>
          <td class="name"><a href="#gm/${g.team}">${esc(g.name)}</a><div class="small muted">${esc(g.team_name)}${g.seasons < 3 ? ` · ${g.seasons} seasons` : ''}</div></td>
          <td class="hide-sm"><span class="team-tag">${g.team}</span></td>
          <td class="num hide-sm">${monthYear(g.start_date)}${g.clipped ? '†' : ''}</td>
          <td class="num hide-sm">${g.scores.overall.count}</td>
          ${MAIN_COLS.map(([k]) => scoreCell(g.scores[k], metric)).join('')}
        </tr>`).join('')}</tbody>
    </table></div>
    ${formerTable(key, metric)}
    <p class="small muted">† Tenure began before ${seasonLabel(S.first_season)}; only moves from then on are counted. Per-season scores mix in 3 seasons of league-average performance, and the per-season ranking subtracts an uncertainty penalty that shrinks with tenure, so GMs with short tenures need a clearly strong record to rank high. Ratings compare each score per season with the other GMs. Hover a score for its rank.</p>`;
  bindMetric(view, renderGMs);
  view.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => { state.sortKey = th.dataset.sort; save(); renderGMs(); }));
  bindRowLinks(view);
}

// Per season: GMs are ranked on the confidence-adjusted score (short tenures need a clearly
// strong record); the cell still shows the per-season score. Total: ranked on the total.
const gmSortVal = (g, key, metric) => g.scores[key][metric === 'per_season' ? 'confidence' : metric] ?? -1e9;

function formerTable(key, metric) {
  const rows = [...(S.former_gms || [])].sort((a, b) => gmSortVal(b, key, metric) - gmSortVal(a, key, metric));
  if (!rows.length) return '';
  const yr = d => d.slice(0, 4);
  return `<h2 style="margin-top:28px">Former GMs</h2>
    <p class="lede">Every finished tenure since ${seasonLabel(S.first_season)}, scored the same way and ranked against each other (one row per team, so a GM who ran two teams appears twice). Same sort and per-season / total toggle as above.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>GM</th><th class="hide-sm">Team</th><th class="num hide-sm">Tenure</th><th class="num hide-sm">Moves</th>
      ${MAIN_COLS.map(([k, l]) => sortHead(k, l, key)).join('')}</tr></thead>
      <tbody>${rows.map((g, i) => `
        <tr class="link" data-href="#former/${g.key}">
          <td class="rank">${i + 1}</td>
          <td class="name"><a href="#former/${g.key}">${esc(g.name)}</a><div class="small muted">${esc(g.team_name)}${g.now_at ? ` · now runs <a href="#gm/${g.now_at}">${g.now_at}</a>` : ''}</div></td>
          <td class="hide-sm"><span class="team-tag">${g.team}</span></td>
          <td class="num hide-sm">${yr(g.start_date)}${g.clipped ? '†' : ''}–${yr(g.end_date)}<div class="rk">${g.seasons} season${g.seasons === 1 ? '' : 's'}</div></td>
          <td class="num hide-sm">${g.scores.overall.count}</td>
          ${MAIN_COLS.map(([k]) => scoreCell(g.scores[k], metric)).join('')}
        </tr>`).join('')}</tbody>
    </table></div>`;
}

function seasonLabel(s) { return `${s - 1}-${String(s).slice(2)}`; }

function bindRowLinks(view) {
  view.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
}

/* ---------- current GM / coach links with their rank ---------- */
function gmLink(team) {
  const g = S.gms.find(x => x.team === team);
  if (!g) return '–';
  return `<a href="#gm/${team}">${esc(g.name)}</a> <span class="muted" title="GM rank (score per season)">(#${g.scores.overall.rank}/${g.scores.overall.of})</span>`;
}

function coachLink(team) {
  const c = (S.coaches || []).find(x => x.team === team);
  if (c) return `<a href="#coach/${team}">${esc(c.name)}</a> <span class="muted" title="Coach rank (overachievement)">(#${c.rank}/${c.of})</span>`;
  const n = (S.coaches_new || []).find(x => x.team === team);
  return n ? `${esc(n.name)} <span class="muted" title="No completed season with this team yet">(1st season)</span>` : '–';
}

/* ---------- team list ---------- */
function renderTeams() {
  const view = $('#view');
  const h = state.horizon in S.teams ? state.horizon : 'all';
  const key = state.teamSort, metric = state.metric;
  const rows = [...S.teams[h]].sort((a, b) => (b.scores[key][metric] ?? -1e9) - (a.scores[key][metric] ?? -1e9));
  view.innerHTML = `
    <h2>Teams</h2>
    <p class="lede">Every move by every franchise regardless of who ran it, over the horizon you choose. Click a team to see each move.</p>
    <div class="toolbar">
      <label>Horizon <select id="horizon">${Object.entries(S.horizons).map(([k, l]) => `<option value="${k}" ${k === h ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${metricToggle()}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Team</th><th class="hide-sm">Current GM</th><th class="hide-sm">Current coach</th><th class="num hide-sm">Moves</th>
      ${MAIN_COLS.map(([k, l]) => sortHead(k, l, key)).join('')}</tr></thead>
      <tbody>${rows.map((t, i) => {
        return `<tr class="link" data-href="#team/${t.team}">
          <td class="rank">${i + 1}</td>
          <td class="name"><span class="team-tag">${t.team}</span><a href="#team/${t.team}">${esc(t.team_name)}</a></td>
          <td class="hide-sm nowrap">${gmLink(t.team)}</td>
          <td class="hide-sm nowrap">${coachLink(t.team)}</td>
          <td class="num hide-sm">${t.scores.overall.count}</td>
          ${MAIN_COLS.map(([k]) => scoreCell(t.scores[k], metric)).join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="small muted">Per season divides by the length of the horizon. Ratings compare each team with the other 29 over the same horizon. The number in parentheses is the current GM's rank among GMs and the current coach's rank among coaches.</p>`;
  $('#horizon').addEventListener('change', e => { state.horizon = e.target.value; save(); renderTeams(); });
  bindMetric(view, renderTeams);
  view.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => { state.teamSort = th.dataset.sort; save(); renderTeams(); }));
  bindRowLinks(view);
}

/* ---------- detail pages ---------- */
function initialToggle() {
  return `<label class="small toggle"><input type="checkbox" id="show-initial" ${state.showInitial ? 'checked' : ''}> Show initial scores</label>`;
}

function bindInitialToggle(view) {
  const apply = () => view.classList.toggle('hide-initial', !state.showInitial);
  $('#show-initial', view).addEventListener('change', e => { state.showInitial = e.target.checked; save(); apply(); });
  apply();
}

function categoryTable(scores) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Category</th><th class="num">Score</th><th class="num">Per season</th><th class="num">Moves</th><th class="num hide-sm">Avg / move</th><th>Rating</th><th class="num">Rank</th></tr></thead>
    <tbody>${SUB_ORDER.map(k => {
      const b = scores[k];
      return `<tr class="${SUB_FIELD[k] === 'initial' ? 'ini' : ''}"><td>${esc(S.subs[k])}</td><td class="num strong">${fmt(b.total)}</td><td class="num">${fmt(b.per_season, 2)}</td>
        <td class="num">${b.count}</td><td class="num hide-sm">${fmt(b.avg, 2)}</td><td>${pill(b.rating)}</td>
        <td class="num">${b.count ? `${b.rank} / ${b.of}` : '–'}</td></tr>`;
    }).join('')}
    ${scores.overall_resolved ? `<tr class="res-only"><td class="strong">Overall (resolved scores)</td><td class="num strong">${fmt(scores.overall_resolved.total)}</td><td class="num strong">${fmt(scores.overall_resolved.per_season, 2)}</td>
      <td class="num">${scores.overall_resolved.count}</td><td class="hide-sm"></td><td>${pill(scores.overall_resolved.rating)}</td><td class="num strong">${scores.overall_resolved.rank} / ${scores.overall_resolved.of}</td></tr>` : ''}
    <tr class="ini-only"><td class="strong">Overall (headline scores)</td><td class="num strong">${fmt(scores.overall.total)}</td><td class="num strong">${fmt(scores.overall.per_season, 2)}</td>
      <td class="num">${scores.overall.count}</td><td class="hide-sm"></td><td>${pill(scores.overall.rating)}</td><td class="num strong">${scores.overall.rank} / ${scores.overall.of}</td></tr>
    </tbody></table></div>`;
}

function bestWorst(d) {
  return `<div class="bw-grid">${SUB_ORDER.map(k => {
    const li = it => `<li><button type="button" data-goto="${it.id}">${esc(it.title)}</button><span class="s">${pill(it.score_label)}<div class="small num">${fmt(it.score)}</div></span><span class="d">${fmtDate(it.date)}</span></li>`;
    const b = d.best[k] || [], w = d.worst[k] || [];
    return `<div class="card bw ${SUB_FIELD[k] === 'initial' ? 'ini' : ''}"><h4>${esc(S.subs[k])}</h4>
      <div class="col-h">Best 3</div>${b.length ? `<ol>${b.map(li).join('')}</ol>` : '<div class="small muted">None yet</div>'}
      <div class="col-h">Worst 3</div>${w.length ? `<ol>${w.map(li).join('')}</ol>` : '<div class="small muted">None yet</div>'}</div>`;
  }).join('')}</div>`;
}

function movesSection(items) {
  return `<h3>Every move</h3>
    <div class="toolbar">
      <label>Type <select id="f-cat"><option value="">All</option>${Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Rating <select id="f-lab"><option value="">All</option>${['VERY GOOD', 'GOOD', 'OK', 'BAD', 'VERY BAD', 'PENDING'].map(l => `<option>${l}</option>`).join('')}</select></label>
      <label>Search <input type="search" id="f-q" placeholder="Player or text"></label>
      <span class="small muted" id="f-count"></span>
    </div>
    <div class="table-wrap"><table id="moves">
      <thead><tr><th>Date</th><th>Type</th><th>Move</th><th class="num ini">Initial</th><th class="num">Resolved</th><th class="num hide-sm">Played out</th><th>Rating</th></tr></thead>
      <tbody></tbody></table></div>`;
}

function moveRow(it) {
  const resHead = it.headline_kind === 'resolved';
  const ini = it.category === 'draft' ? '–' : `<span class="${resHead ? 'dim' : 'strong'}">${fmt(it.initial)}</span>`;
  const res = `<span class="${resHead ? 'strong' : 'dim'}">${fmt(it.resolved)}</span>`;
  return `<tr class="link move" data-id="${it.id}" id="m${it.id}">
    <td class="num">${fmtDate(it.date)}</td><td>${CATS[it.category]}</td>
    <td>${esc(it.title)}${it.exec ? `<div class="small muted">${esc(it.exec)}</div>` : ''}</td>
    <td class="num ini">${ini}</td><td class="num">${res}</td><td class="num hide-sm">${Math.round((it.resolution || 0) * 100)}%</td>
    <td><span class="ini-only">${pill(it.label)}</span><span class="res-only">${pill(it.resolved_label || it.label)}</span></td></tr>`;
}

function seasonRows(rows, title) {
  if (!rows || !rows.length) return '';
  return `<div class="small strong" style="margin-top:6px">${title}</div><table><thead><tr><th>Season</th><th class="num">Fair salary</th><th class="num">Paid</th><th class="num">Share of season</th><th class="num">Surplus</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td class="in">${seasonLabel(r.season)}</td><td class="num in">${r.fair ?? '–'}%</td><td class="num in">${r.salary_pct ?? '–'}%</td><td class="num in">${Math.round(r.share * 100)}%</td><td class="num in">${fmt(r.surplus)}</td></tr>`).join('')}</tbody></table>`;
}

function moveDetail(it) {
  const d = it.detail || {};
  let h = '';
  if (it.category === 'draft') {
    h = `<div class="kv">${d.undrafted ? '<span>Undrafted</span>' : `<span>Pick <b>#${d.pick}</b></span>`}${d.rerank != null ? `<span>Re-ranked <b>#${Math.round(d.rerank)}</b> of ${d.class_size}</span>` : ''}
      ${d.career_value != null ? `<span>Career value ${d.career_value} (cap-% seasons)</span><span>Career WS ${d.career_ws}</span><span>${d.seasons} seasons</span>` : ''}
      ${d.lottery_bonus ? `<span>Lottery bonus +${d.lottery_bonus}</span>` : ''}${d.via_trade ? `<span>Acquired on draft night from ${d.via_trade}</span>` : ''}${d.note ? `<span>${esc(d.note)}</span>` : ''}</div>`;
  } else if (it.category === 'signing') {
    h = `<div class="kv"><span>${esc(d.kind)}</span><span><b>${d.years}</b> yr${d.years > 1 ? 's' : ''}</span><span>AAV ${money(d.aav)} = <b>${d.aav_pct}%</b> of cap</span>
      <span>Fair salary before: <b>${d.fair_pre ?? 'n/a'}${d.fair_pre != null ? '%' : ''}</b></span></div>
      ${d.stats_before && d.stats_before.length ? `<div class="small muted">Before: ${d.stats_before.map(x => `${seasonLabel(x.season)} ${x.mp} min, ${x.ws} WS, ${x.vorp} VORP, BPM ${x.bpm ?? '–'}`).join(' · ')}</div>` : ''}
      ${seasonRows(d.realized, 'With this team')}`;
  } else if (it.category === 'letgo') {
    h = `<div class="kv"><span>${esc(d.kind)}</span><span>Signed with <b>${esc(d.new_team)}</b>: ${d.new_years} yr, ${money(d.new_aav)} (${d.new_aav_pct}% of cap)</span>
      <span>Fair salary when let go: <b>${d.fair_pre}%</b></span></div>${seasonRows(d.realized_elsewhere, 'With the new team')}
      ${d.new_contract_text ? `<div class="src">${esc(d.new_contract_text)}</div>` : ''}`;
  } else if (it.category === 'trade') {
    h = `<table><thead><tr><th></th><th>Asset</th><th class="num ini">Initial</th><th class="num">Resolved</th><th class="num">Played out</th><th class="num">Fair before</th><th class="num">Salary</th><th class="num">Yrs left</th></tr></thead>
      <tbody>${(d.assets || []).map(a => `<tr><td class="in">${a.dir === 'in' ? 'Got' : 'Gave'}</td><td class="in">${esc(a.name)}${a.expiring ? ' <span class="small muted">(expiring)</span>' : ''}${a.note ? `<div class="small muted">${esc(a.note)}</div>` : ''}</td>
        <td class="num in ini">${fmt(a.initial)}</td><td class="num in">${fmt(a.resolved)}</td><td class="num in">${Math.round(a.resolution * 100)}%</td>
        <td class="num in">${a.fair_pre != null ? a.fair_pre + '%' : '–'}</td><td class="num in">${a.salary_pct != null ? a.salary_pct + '%' : '–'}</td><td class="num in">${a.years_left ?? '–'}</td></tr>`).join('')}</tbody></table>`;
  }
  if (d.text) h += `<div class="src">${esc(d.text)}</div>`;
  if (it.initial_label && it.category !== 'draft') h += `<div class="small ini" style="margin-top:6px">Initial: ${pill(it.initial_label)} · Resolved: ${pill(it.resolved_label)} · Headline uses the <b>${it.headline_kind}</b> score (${Math.round((it.resolution || 0) * 100)}% played out; the rest is estimated from the latest production).</div>`;
  return `<tr class="detail-row" data-for="${it.id}"><td colspan="7">${h}</td></tr>`;
}

function bindMoves(view, items) {
  const tbody = $('#moves tbody', view);
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const draw = () => {
    const c = $('#f-cat', view).value, l = $('#f-lab', view).value, q = $('#f-q', view).value.trim().toLowerCase();
    const rows = sorted.filter(i => (!c || i.category === c) && (!l || i.label === l) && (!q || (i.title + ' ' + (i.detail?.text || '')).toLowerCase().includes(q)));
    tbody.innerHTML = rows.length ? rows.map(moveRow).join('') : `<tr><td colspan="7" class="empty">No moves match.</td></tr>`;
    $('#f-count', view).textContent = `${rows.length} of ${items.length}`;
  };
  ['#f-cat', '#f-lab'].forEach(s => $(s, view).addEventListener('change', draw));
  $('#f-q', view).addEventListener('input', draw);
  tbody.addEventListener('click', e => {
    const tr = e.target.closest('tr.move');
    if (!tr) return;
    const open = tbody.querySelector(`tr[data-for="${tr.dataset.id}"]`);
    if (open) { open.remove(); return; }
    tr.insertAdjacentHTML('afterend', moveDetail(byId[tr.dataset.id]));
  });
  view.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    $('#f-cat', view).value = ''; $('#f-lab', view).value = ''; $('#f-q', view).value = ''; draw();
    const tr = $(`#m${b.dataset.goto}`, view);
    if (tr) { if (!tbody.querySelector(`tr[data-for="${b.dataset.goto}"]`)) tr.click(); tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }));
  draw();
}

/* ---------- roster profile (value set) ---------- */
const zClass = z => z >= 1 ? 'z-vg' : z >= 0.35 ? 'z-g' : z > -0.35 ? 'z-ok' : z > -1 ? 'z-b' : 'z-vb';
function fmtMetric(key, v) {
  if (v == null) return '–';
  if (['ts', 'reb', 'ast', 'blk', '3par'].includes(key)) return (v * 100).toFixed(1) + '%';
  if (key === 'tov') return v.toFixed(1) + '%';
  if (key === 'stl') return v.toFixed(1);
  return v.toFixed(3);
}

function styleSection(d, who = 'GM', peers = 'GMs') {
  const st = d.style, M = S.style_metrics;
  if (!st || !st.seasons || !st.seasons.length) {
    return `<h3>Roster profile</h3><p class="small muted">No completed season under this ${who} yet; the profile appears after their first full season.</p>`;
  }
  const of = st.ranked_of;
  const list = xs => xs.map(x => `<b>${esc(x.noun)}</b> <span class="muted">(#${x.gm_rank}/${of})</span>`).join(', ');
  const head = `<tr><th>Season</th>${M.map(m => `<th class="num" title="${m.higher_better ? 'Higher is better' : 'Lower is better'}">${esc(m.label)}</th>`).join('')}</tr>`;
  const cell = (key, c) => c ? `<td class="num ${zClass(c.z)}" title="z ${c.z >= 0 ? '+' : ''}${c.z} vs league that season">${fmtMetric(key, c.v)}<div class="rk">#${c.rank}</div></td>` : '<td class="num">–</td>';
  const rows = [...st.seasons].reverse().map(r => `<tr><td class="nowrap">${seasonLabel(r.season)}${r.record && r.record[0] != null ? `<div class="rk">${r.record[0]}-${r.record[1]}</div>` : ''}</td>${M.map(m => cell(m.key, r.metrics[m.key])).join('')}</tr>`).join('');
  const avg = `<tr class="sum"><td>Average</td>${M.map(m => { const a = st.avg[m.key]; return a ? `<td class="num ${zClass(a.z)}">${a.z >= 0 ? '+' : ''}${a.z.toFixed(2)}<div class="rk">avg rank ${a.rank_avg}</div></td>` : '<td></td>'; }).join('')}</tr>`;
  const gmr = `<tr class="sum"><td>Rank among ${peers}</td>${M.map(m => { const a = st.avg[m.key]; return a ? `<td class="num strong">${a.gm_rank} / ${a.of}</td>` : '<td></td>'; }).join('')}</tr>`;
  return `<h3>Roster profile (value set)</h3>
    <p class="lede">What this ${who}'s teams were good and bad at, season by season (${st.seasons.length} completed season${st.seasons.length > 1 ? 's' : ''} in charge${who === 'coach' ? ', counting seasons he coached at least half of' : ''}). Strengths and weaknesses are relative to the other ${peers}. Each cell is the team's rate and its league rank that season; colors compare it with the other 29 teams that year (z-score; for turnovers and points allowed, lower is better), so different eras are comparable.</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Strengths${d.adjusted ? ' (raw)' : ''}</div><div class="small">${st.strengths.length ? list(st.strengths) : `<span class="muted">none in the top third of ${peers}</span>`}</div></div>
      <div class="tile"><div class="k">Weaknesses${d.adjusted ? ' (raw)' : ''}</div><div class="small">${st.weaknesses.length ? list(st.weaknesses) : `<span class="muted">none in the bottom third of ${peers}</span>`}</div></div>
      ${d.adjusted && d.adjusted.avg && Object.keys(d.adjusted.avg).length ? `
      <div class="tile tile-adj"><div class="k">Normalized strengths <span class="muted">(vs roster expectation)</span></div><div class="small">${(d.adjusted.strengths || []).length ? adjList(d.adjusted.strengths, d.adjusted.of) : `<span class="muted">none in the top third of ${peers}</span>`}</div></div>
      <div class="tile tile-adj"><div class="k">Normalized weaknesses <span class="muted">(vs roster expectation)</span></div><div class="small">${(d.adjusted.weaknesses || []).length ? adjList(d.adjusted.weaknesses, d.adjusted.of) : `<span class="muted">none in the bottom third of ${peers}</span>`}</div></div>` : ''}
      <div class="tile"><div class="k">Overall level</div><div class="v">#${st.level_rank} / ${of}</div><div class="small muted">average z ${st.level >= 0 ? '+' : ''}${st.level}</div></div>
      <div class="tile"><div class="k">Roster balance</div><div class="v">#${st.balance_rank} / ${of}</div><div class="small muted">avg shortfall ${st.shortfall} (0 = no weak spots)</div></div>
      <div class="tile"><div class="k">Specialization</div><div class="v">${st.spread >= 0.8 ? 'Specialist' : st.spread >= 0.5 ? 'Mixed' : 'Generalist'}</div><div class="small muted">spread ${st.spread} · #${st.spec_rank} most specialized</div></div>
    </div>
    <div class="table-wrap"><table class="style-table"><thead>${head}</thead><tbody>${rows}${avg}${gmr}</tbody></table></div>`;
}

/* ---------- roster brittleness (depth beyond the top two) ---------- */
function depthSection(d) {
  const dp = d.depth, M = S.depth_metrics;
  if (!dp || !dp.seasons || !dp.seasons.length) return '';
  const sg = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  const list = xs => xs.map(x => `<b>${esc(x.noun)}</b> <span class="muted">(#${x.gm_rank}/${dp.of})</span>`).join(', ');
  const head = `<tr><th>Season</th><th class="num">Depth score</th>${M.map(m => `<th class="num" title="${m.higher_better ? 'Higher is better' : 'Lower is better'} (z oriented so + is better)">${esc(m.label)}</th>`).join('')}</tr>`;
  const cell = c => c ? `<td class="num ${zClass(c.v * 2)}">${sg(c.v)}<div class="rk">#${c.rank}</div></td>` : '<td class="num">–</td>';
  const pz = (p, k) => { const v = p.z[k]; if (v == null) return '<td class="num">–</td>';
    const cut = p.omitted.includes(k); return `<td class="num ${cut ? 'muted' : zClass(v)}" title="${cut ? 'Top two on the team: left out of the average' : ''}">${cut ? '<s>' + sg(v) + '</s>' : sg(v)}</td>`; };
  const rows = [...dp.seasons].reverse().map((r, i) => `
    <tr class="depth-row" data-i="${i}" style="cursor:pointer"><td class="nowrap">▸ ${seasonLabel(r.season)}${r.record && r.record[0] != null ? `<div class="rk">${r.record[0]}-${r.record[1]}</div>` : ''}</td>
      <td class="num strong ${zClass(r.score * 2)}">${sg(r.score)}<div class="rk">#${r.score_rank}/${r.of}</div></td>${M.map(m => cell(r.cats[m.key])).join('')}</tr>
    <tr class="depth-players" data-i="${i}" hidden><td colspan="${M.length + 2}"><table class="style-table"><thead><tr><th>Player</th><th class="num">G</th><th class="num">Min/g</th>${M.map(m => `<th class="num">${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      ${r.players.map(p => `<tr><td class="nowrap">${esc(p.name)} <span class="muted small">${esc(p.pos)}</span></td><td class="num">${p.g}</td><td class="num">${p.mpg}</td>${M.map(m => pz(p, m.key)).join('')}</tr>`).join('')}
    </tbody></table></td></tr>`).join('');
  const avg = `<tr class="sum"><td>Average</td><td class="num strong">${sg(dp.score)}<div class="rk">avg rank ${dp.score_rank_avg}</div></td>${M.map(m => { const a = dp.avg[m.key]; return a ? `<td class="num ${zClass(a.v * 2)}">${sg(a.v)}<div class="rk">avg rank ${a.rank_avg}</div></td>` : '<td></td>'; }).join('')}</tr>`;
  const gmr = `<tr class="sum"><td>Rank among GMs</td><td class="num strong">${dp.rank} / ${dp.of}</td>${M.map(m => { const a = dp.avg[m.key]; return a ? `<td class="num strong">${a.gm_rank} / ${a.of}</td>` : '<td></td>'; }).join('')}</tr>`;
  return `<h3>Roster brittleness (non-top-heavy value set)</h3>
    <p class="lede">Can the rest of the roster carry the load when stars get hurt? Each season, every player with 15+ games and 10+ minutes a game for the team is compared with his position group (guards, wings, bigs) league-wide that season (z-score; + is better, so for turnovers and points allowed lower raw numbers score higher). In each category the team's <b>top two players are left out</b> and the rest are averaged; the small number is that average's rank among the 30 teams. The depth score is the mean of the ten. Click a season to see the players (struck-through values are the top two that were left out).</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Depth rank</div><div class="v">#${dp.rank} / ${dp.of}</div><div class="small muted">${dp.rank <= dp.of / 3 ? 'deep (least brittle)' : dp.rank > dp.of * 2 / 3 ? 'top-heavy (brittle)' : 'middle of the pack'} · avg ${sg(dp.score)}</div></div>
      <div class="tile"><div class="k">Depth strengths</div><div class="small">${(dp.strengths || []).length ? list(dp.strengths) : '<span class="muted">none in the top third of GMs</span>'}</div></div>
      <div class="tile"><div class="k">Depth weaknesses</div><div class="small">${(dp.weaknesses || []).length ? list(dp.weaknesses) : '<span class="muted">none in the bottom third of GMs</span>'}</div></div>
    </div>
    <div class="table-wrap"><table class="style-table depth-table"><thead>${head}</thead><tbody>${rows}${avg}${gmr}</tbody></table></div>`;
}
function bindDepth(view) {
  view.querySelectorAll('.depth-row').forEach(tr => tr.addEventListener('click', () => {
    const p = view.querySelector(`.depth-players[data-i="${tr.dataset.i}"]`);
    p.hidden = !p.hidden;
    tr.cells[0].innerHTML = tr.cells[0].innerHTML.replace(p.hidden ? '▾' : '▸', p.hidden ? '▸' : '▾');
  }));
}

async function renderGM(team, former = false) {
  const view = $('#view');
  const d = await getJSON(former ? `data/gm/former/${team}.json` : `data/gm/${team}.json`);
  const sc = d.scores;
  view.innerHTML = `<a class="back" href="#gms">← All GMs</a>${former ? ' <span class="small muted">(former GM: ranks are among the other former GMs)</span>' : ''}
    <div class="hero"><div class="who"><h2>${esc(d.name)}</h2>
      <p><span class="team-tag">${d.team}</span><a href="#team/${d.team}">${esc(d.team_name)}</a> · ${d.end_date ? `ran the team ${fmtDate(d.start_date)} – ${fmtDate(d.end_date)}` : `running the team since ${fmtDate(d.start_date)}`}${d.clipped ? ` (counted from ${seasonLabel(S.first_season)})` : ''} · ${d.seasons} season${d.seasons === 1 ? '' : 's'}${d.now_at ? ` · now runs <a href="#gm/${d.now_at}">${d.now_at}</a>` : ''}</p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">${d.end_date ? 'Rank among former GMs' : 'GM rank'}</div><div class="v">${sc.overall.rank} / ${sc.overall.of}</div></div>
        <div class="tile"><div class="k">Score / season</div><div class="v">${fmt(sc.overall.per_season, 2)}</div></div>
        <div class="tile"><div class="k">Total score</div><div class="v">${fmt(sc.overall.total)}</div></div>
        <div class="tile"><div class="k">Rating</div><div class="v">${pill(sc.overall.rating)}</div></div>
      </div></div>
    <div class="toolbar">${initialToggle()}<span class="small muted">Off: only resolved scores (what actually happened; unfinished parts estimated from the latest production).</span></div>
    <h3>Scores by category</h3>${categoryTable(sc)}
    ${styleSection(d)}
    ${depthSection(d)}
    <h3>Best and worst moves</h3>${bestWorst(d)}
    ${movesSection(d.items)}`;
  bindMoves(view, d.items);
  bindInitialToggle(view);
  bindDepth(view);
}

async function renderTeam(team) {
  const view = $('#view');
  const d = await getJSON(`data/team/${team}.json`);
  const tiles = Object.entries(S.horizons).map(([h, l]) => {
    const t = S.teams[h].find(x => x.team === team);
    return `<div class="tile"><div class="k">${esc(l)}</div><div class="v">#${t.scores.overall.rank}</div><div class="small">${fmt(t.scores.overall.total)} · ${pill(t.scores.overall.rating)}</div></div>`;
  }).join('');
  const h = state.horizon in S.teams ? state.horizon : 'all';
  const ts = S.teams[h].find(x => x.team === team);
  const pj = S.projection && S.projection.teams.find(x => x.team === team);
  view.innerHTML = `<a class="back" href="#teams">← All teams</a>
    <div class="hero"><div class="who"><h2>${esc(d.team_name)}</h2>
      <p>${d.gm ? `Current GM: ${gmLink(team)}, since ${monthYear(d.gm.start_date)} · ` : ''}Current coach: ${coachLink(team)} · moves since ${S.team_horizon_start}</p></div>
      <div class="stat-tiles">${tiles}${pj ? `<div class="tile"><div class="k">${seasonLabel(S.projection.season)} outlook</div><div class="v"><a href="#outlook/${team}">#${pj.rank}</a></div><div class="small">${sgn(pj.net)} · ${Math.round(pj.wins)}-${82 - Math.round(pj.wins)}</div></div>` : ''}</div></div>
    <div class="toolbar">${initialToggle()}<span class="small muted">Off: only resolved scores (what actually happened; unfinished parts estimated from the latest production).</span></div>
    <h3>Scores by category <span class="small muted">(${esc(S.horizons[h])}; change on the Teams page)</span></h3>${categoryTable(ts.scores)}
    <h3>Best and worst moves since ${S.team_horizon_start}</h3>${bestWorst(d)}
    ${movesSection(d.items)}`;
  bindMoves(view, d.items);
  bindInitialToggle(view);
}

/* ---------- coaches ---------- */
const sgn = (v, d = 2) => v == null ? '–' : (v > 0 ? '+' : '') + Number(v).toFixed(d);
const zCls = v => v >= 3 ? 'z-vg' : v >= 1 ? 'z-g' : v > -1 ? 'z-ok' : v > -3 ? 'z-b' : 'z-vb';

function coachRows(list, linkFn, former) {
  return list.map((c, i) => `
    <tr class="link" data-href="${linkFn(c)}">
      <td class="rank">${i + 1}</td>
      <td class="name"><a href="${linkFn(c)}">${esc(c.name)}</a><div class="small muted">${esc(c.team_name)}</div></td>
      <td class="hide-sm"><span class="team-tag">${c.team}</span></td>
      <td class="num hide-sm">${former ? `${seasonLabel(c.first_season)} – ${seasonLabel(c.last_season)}` : seasonLabel(c.since)}<div class="rk">${c.games} games</div></td>
      <td class="num ${zCls(c.avg)}"><span class="strong">${sgn(c.avg)}</span></td>
      <td class="num hide-sm">${sgn(c.cumulative)}</td>
      <td class="num">${sgn(c.score)}</td>
      <td>${pill(c.rating)}</td>
    </tr>`).join('');
}

function renderCoaches() {
  const view = $('#view');
  const cur = [...(S.coaches || [])].sort((a, b) => a.rank - b.rank);
  const former = [...(S.former_coaches || [])].sort((a, b) => a.rank - b.rank);
  const head = former => `<thead><tr><th>#</th><th>Coach</th><th class="hide-sm">Team</th><th class="num hide-sm">${former ? 'Tenure' : 'Since'}</th>
    <th class="num" title="Games-weighted average overachievement per season (points per 100 possessions above projection)">Avg / season</th>
    <th class="num hide-sm" title="Sum over the tenure, in 82-game seasons">Cumulative</th>
    <th class="num" title="Average shrunk toward 0 by two average seasons; used for the rank">Rank score</th><th>Rating</th></tr></thead>`;
  view.innerHTML = `
    <h2>Coaches</h2>
    <p class="lede">Did the players play better or worse than projected under this coach? Each season, every player's Box Plus/Minus is projected from his last three seasons (with aging and regression) and compared with what he did. The team's minutes-weighted difference is in points per 100 possessions above projection. Ranked by the average over the coach's seasons with his current team.</p>
    <div class="table-wrap"><table>${head(false)}<tbody>${coachRows(cur, c => `#coach/${c.team}`, false)}</tbody></table></div>
    ${(S.coaches_new || []).length ? `<p class="small muted">No completed season with their team yet (not ranked): ${S.coaches_new.map(c => `<b>${esc(c.name)}</b> (${c.team})`).join(', ')}.</p>` : ''}
    <h2 style="margin-top:28px">Former coaches</h2>
    <p class="lede">Every finished coaching run since ${seasonLabel(S.first_season + 1)} with at least 20 games, one row per team, ranked the same way.</p>
    <div class="table-wrap"><table>${head(true)}<tbody>${coachRows(former, c => `#fcoach/${c.key}`, true)}</tbody></table></div>
    <p class="small muted">Rank score = average shrunk toward 0 by two average seasons, so one great year can't top the table. Ratings compare rank scores within each table. See Method for caveats (tanking seasons, mid-season changes, long tenures measured partly against their own earlier work).</p>`;
  bindRowLinks(view);
}

/* coaching-adjusted ("normalized") strengths and weaknesses */
function fmtAdj(key, v) {
  if (v == null) return '–';
  if (key === 'ts' || key === '3par') return (v * 100).toFixed(1) + '%';
  if (key === 'ftr') return v.toFixed(3);
  if (key === 'off' || key === 'def') return sgn(v, 1);
  return v.toFixed(1) + '%';
}

function fmtDelta(key, d) {
  if (d == null) return '–';
  if (key === 'ts' || key === '3par') return sgn(d * 100, 1) + ' pts';
  if (key === 'ftr') return sgn(d, 3);
  if (key === 'off' || key === 'def') return sgn(d, 1);
  return sgn(d, 1) + ' pts';
}

function adjList(xs, of) {
  return xs.map(x => `<b>${esc(x.noun)}</b> <span class="${(x.key === 'tov' ? -x.diff : x.diff) >= 0 ? 'pos' : 'neg'}">${fmtDelta(x.key, x.diff)}</span> <span class="muted">(#${x.rank}/${of})</span>`).join(', ');
}

function adjustedSection(c, peers) {
  const A = c.adjusted, M = S.adjusted_metrics || [];
  if (!A || !A.seasons || !A.seasons.length) return '';
  const of = A.of;
  const list = xs => adjList(xs, of);
  const head = `<tr><th>Season</th>${M.map(m => `<th class="num" title="${m.higher_better ? 'Higher is better' : 'Lower is better'}">${esc(m.label)}</th>`).join('')}</tr>`;
  const cell = (k, v) => v ? `<td class="num ${v.z != null ? zClass(v.z) : ''}" title="Expected ${fmtAdj(k, v.exp)} from these players' past seasons; actual ${fmtAdj(k, v.act)}; z ${v.z ?? '–'} vs the league that season">${fmtAdj(k, v.act)}<div class="rk">exp ${fmtAdj(k, v.exp)} · Δ ${fmtDelta(k, v.diff)}</div></td>` : '<td class="num">–</td>';
  const rows = [...A.seasons].reverse().map(r => `<tr><td class="nowrap">${seasonLabel(r.season)}</td>${M.map(m => cell(m.key, r.metrics[m.key])).join('')}</tr>`).join('');
  const avg = `<tr class="sum"><td>Average change vs expected</td>${M.map(m => { const a = A.avg[m.key]; return a ? `<td class="num ${zClass(a.z)}">${fmtDelta(m.key, a.diff)}<div class="rk">z ${a.z >= 0 ? '+' : ''}${a.z.toFixed(2)} vs league</div></td>` : '<td></td>'; }).join('')}</tr>`;
  const rk = `<tr class="sum"><td>Rank among ${esc(peers)}</td>${M.map(m => { const a = A.avg[m.key]; return a && a.rank ? `<td class="num strong">${a.rank} / ${a.of}</td>` : '<td></td>'; }).join('')}</tr>`;
  return `<h3>Coaching-adjusted strengths and weaknesses (normalized)</h3>
    <p class="lede">The roster profile above partly reflects the players a coach inherited. Here, each season compares the team's <b>actual</b> rates with what <b>the same players</b> were expected to produce, from their previous three seasons (recency-weighted) and the minutes he gave them. The change is compared with all 30 teams that season (z-score), averaged over his seasons and ranked against the other ${esc(peers)}. Shooting stats are usage-weighted; rebound, assist, steal and block rates add up across the five on the floor; offense and defense use offensive and defensive BPM.</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Normalized strengths</div><div class="small">${A.strengths && A.strengths.length ? list(A.strengths) : `<span class="muted">none in the top third of ${esc(peers)}</span>`}</div></div>
      <div class="tile"><div class="k">Normalized weaknesses</div><div class="small">${A.weaknesses && A.weaknesses.length ? list(A.weaknesses) : `<span class="muted">none in the bottom third of ${esc(peers)}</span>`}</div></div>
    </div>
    <div class="table-wrap"><table class="style-table"><thead>${head}</thead><tbody>${rows}${avg}${rk}</tbody></table></div>
    <p class="small muted">Each cell: the team's actual rate (big), the rate expected from its players' track records and Δ = actual − expected (small); the color is how that change compares with every team that season. Ranks compare each coach's change with the league's typical change, so a small positive Δ can still rank low if most teams improved more. Only players with NBA history are compared.</p>`;
}

function otherRuns(c) {
  const runs = c.other_runs || [];
  if (!runs.length) return '';
  return `<h2 style="margin-top:32px">${c.end_date || c.key ? 'Other teams' : 'Former teams'}</h2>
    <p class="lede">${esc(c.name)}'s other head-coaching runs since ${seasonLabel(S.first_season + 1)}, each with its overall rating and roster profile (ranked among ${runs.some(r => r.current) ? 'the coaches in that table' : 'former coaches'}).</p>
    ${runs.map(r => {
      const link = r.current ? `#coach/${r.team}` : `#fcoach/${r.key}`;
      return `<div class="card" style="padding:14px 16px;margin-bottom:16px">
        <div class="hero" style="margin-bottom:8px"><div class="who"><h3 style="margin:0"><span class="team-tag">${r.team}</span><a href="${link}">${esc(r.team_name)}</a></h3>
          <p>${seasonLabel(r.first_season)} – ${r.current ? 'present' : seasonLabel(r.last_season)} · ${r.games} games (${r.record[0]}-${r.record[1]})${r.current ? ' · current team' : ''}</p></div>
          <div class="stat-tiles">
            <div class="tile"><div class="k">${r.current ? 'Coach rank' : 'Rank (former)'}</div><div class="v">${r.rank} / ${r.of}</div></div>
            <div class="tile"><div class="k">Avg / season</div><div class="v">${sgn(r.avg)}</div></div>
            <div class="tile"><div class="k">Cumulative</div><div class="v">${sgn(r.cumulative)}</div></div>
            <div class="tile"><div class="k">Rating</div><div class="v">${pill(r.rating)}</div></div>
          </div></div>
        ${styleSection(r, 'coach', r.current ? 'current coaches' : 'former coaches')}
        ${adjustedSection(r, r.current ? 'current coaches' : 'former coaches')}
        <p class="small"><a href="${link}">Season-by-season details for this run →</a></p></div>`;
    }).join('')}`;
}

async function renderCoach(id, former) {
  const view = $('#view');
  const c = await getJSON(former ? `data/coach/former/${id}.json` : `data/coach/${id}.json`);
  const plist = (ps, cls) => ps.length ? ps.map(p => `<div class="${cls}">${esc(p.name)} <span class="muted">${p.mp} min · proj ${sgn(p.proj, 1)} → ${sgn(p.actual, 1)}</span> <b>${sgn(p.contrib)}</b></div>`).join('') : '<span class="muted">–</span>';
  const rows = [...c.rows].reverse().map(r => `<tr>
      <td class="nowrap">${seasonLabel(r.season)}${r.share < 1 ? `<div class="rk">${Math.round(r.share * 100)}% of games</div>` : ''}</td>
      <td class="num">${r.w}-${r.l}</td>
      <td class="num hide-sm">${r.net_rtg != null ? sgn(r.net_rtg, 1) : '–'}</td>
      <td class="num">${sgn(r.proj)}</td><td class="num">${sgn(r.actual)}</td>
      <td class="num ${zCls(r.diff)}"><span class="strong">${sgn(r.diff)}</span></td>
      <td class="small hide-sm">${plist(r.over, '')}</td><td class="small hide-sm">${plist(r.under, '')}</td></tr>`).join('');
  view.innerHTML = `<a class="back" href="#coaches">← All coaches</a>${former ? ' <span class="small muted">(former coach: ranks are among the other former coaches)</span>' : ''}
    <div class="hero"><div class="who"><h2>${esc(c.name)}</h2>
      <p><span class="team-tag">${c.team}</span><a href="#team/${c.team}">${esc(c.team_name)}</a> · ${former ? `coached ${seasonLabel(c.first_season)} – ${seasonLabel(c.last_season)}` : `head coach since ${seasonLabel(c.since)}`} · ${c.games} games (${c.seasons} seasons)</p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">${former ? 'Rank (former)' : 'Coach rank'}</div><div class="v">${c.rank} / ${c.of}</div></div>
        <div class="tile"><div class="k">Avg / season</div><div class="v">${sgn(c.avg)}</div></div>
        <div class="tile"><div class="k">Cumulative</div><div class="v">${sgn(c.cumulative)}</div></div>
        <div class="tile"><div class="k">Rating</div><div class="v">${pill(c.rating)}</div></div>
      </div></div>
    <h3>Season by season</h3>
    <p class="lede">Projected and actual are the roster's minutes-weighted Box Plus/Minus × 5 (points per 100 possessions vs. an average team); the difference, centered on the league that season, is the overachievement. Over- and under-achievers show each player's projection → actual BPM and his contribution to the team's difference.</p>
    <div class="table-wrap"><table class="style-table"><thead><tr><th>Season</th><th class="num">Record</th><th class="num hide-sm">Net rating</th>
      <th class="num">Projected</th><th class="num">Actual</th><th class="num">Overachievement</th><th class="hide-sm">Biggest overachievers</th><th class="hide-sm">Biggest underachievers</th></tr></thead>
      <tbody>${rows}
      <tr class="sum"><td>Average</td><td class="num">${c.rows.reduce((a, r) => a + r.w, 0)}-${c.rows.reduce((a, r) => a + r.l, 0)}</td><td class="hide-sm"></td><td></td><td></td>
        <td class="num ${zCls(c.avg)}"><span class="strong">${sgn(c.avg)}</span></td><td class="hide-sm"></td><td class="hide-sm"></td></tr></tbody></table></div>
    ${styleSection(c, 'coach', former ? 'former coaches' : 'current coaches')}
    ${adjustedSection(c, former ? 'former coaches' : 'current coaches')}
    ${otherRuns(c)}`;
}

/* ---------- outlook (this season's expectation score) ---------- */
function renderOutlook() {
  const view = $('#view');
  const P = S.projection;
  if (!P) { view.innerHTML = '<p class="empty">No roster projection yet.</p>'; return; }
  view.innerHTML = `
    <h2>${seasonLabel(P.season)} Outlook</h2>
    <p class="lede">The <b>expectation score</b> projects each team's net rating (points per 100 possessions vs an average team) from its current roster: every player's projected impact (Box Plus/Minus from his last three seasons, with aging; rookies from their draft slot and college stats) weighted by his projected minutes and games, with each roster summing to the same 19,680 minutes of an 82-game season. Click a team for its projected rotation. <a href="#injuries"><b>Severe injuries →</b></a> who will miss games this season, why, and for how long.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Team</th><th class="num" title="Projected net rating, points per 100 possessions vs an average team">Expectation score</th><th class="num hide-sm" title="From the projected roster alone">Roster</th><th class="num hide-sm" title="Actual net rating last season (vs league average), weighted 25%">Last season</th><th class="num">Projected wins</th><th class="hide-sm">Top contributors</th><th class="num hide-sm">Roster</th></tr></thead>
      <tbody>${P.teams.map(t => `<tr class="link" data-href="#outlook/${t.team}">
        <td class="rank">${t.rank}</td>
        <td class="name"><span class="team-tag">${t.team}</span><a href="#outlook/${t.team}">${esc(t.team_name)}</a></td>
        <td class="num ${zCls(t.net / 1.5)}"><span class="strong">${sgn(t.net)}</span></td>
        <td class="num hide-sm">${sgn(t.roster_net)}</td><td class="num hide-sm">${t.last_net == null ? '–' : sgn(t.last_net)}</td>
        <td class="num">${Math.round(t.wins)}-${82 - Math.round(t.wins)}</td>
        <td class="hide-sm small">${t.top.map(esc).join(', ')}</td>
        <td class="num hide-sm">${t.roster_size}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Rosters are the current Basketball-Reference team pages (including training-camp players, who mostly project to few minutes). Rookies are projected from draft position plus college stats where available (international players from draft position only); their roles grow where the roster leaves minutes open at their position. See Method for details and the backtest.</p>`;
  bindRowLinks(view);
}

async function renderOutlookTeam(team) {
  const view = $('#view');
  const P = await getJSON('data/projection.json');
  const t = P.teams.find(x => x.team === team);
  if (!t) { view.innerHTML = '<p class="empty">No projection for this team.</p>'; return; }
  const bt = P.backtest || [];
  view.innerHTML = `<a class="back" href="#outlook">← Outlook</a>
    <div class="hero"><div class="who"><h2>${esc(t.team_name)}</h2>
      <p>${seasonLabel(P.season)} projection · <a href="#team/${team}">team moves</a> · GM ${gmLink(team)} · coach ${coachLink(team)}</p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">Expectation rank</div><div class="v">${t.rank} / ${P.teams.length}</div></div>
        <div class="tile"><div class="k">Expectation score</div><div class="v">${sgn(t.net)}</div><div class="small muted">75% roster ${sgn(t.roster_net)} + 25% last season ${t.last_net == null ? '–' : sgn(t.last_net)}</div></div>
        <div class="tile"><div class="k">Projected record</div><div class="v">${Math.round(t.wins)}-${82 - Math.round(t.wins)}</div></div>
      </div></div>
    <h3>Projected rotation</h3>
    <p class="lede">Ordered by projected minutes. <b>Games</b> are his projected games played (recent games regressed toward 65; two-way players at most 50), and <b>min / game</b> = projected minutes ÷ games. <b>Impact</b> is his projected impact: Box Plus/Minus blended 50/50 with EPM in seasons where EPM exists (2025-26 so far), and <b>contribution</b> his share of the team's expectation score (minutes × impact vs league average, in points per 100). Rookies and newcomers get a bigger role where the roster's veterans at their position (guard / wing / big) fall short of the league's usual minutes.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Player</th><th class="num">Age</th><th class="num">Pos</th><th class="hide-sm">Last season</th>
        <th class="num">Games</th><th class="num">Min / game</th><th class="num hide-sm">Minutes</th><th class="num" title="Projected impact: Box Plus/Minus blended 50/50 with EPM for seasons where EPM exists">Impact (BPM+EPM)</th><th class="num">Contribution</th></tr></thead>
      <tbody>${t.players.map((p, i) => {
        const c = p.college;
        const note = p.bpm_basis === 'history' ? 'projected from last 3 seasons'
          : p.bpm_basis === 'rookie+college' ? 'rookie: draft slot + college stats'
          : p.bpm_basis === 'rookie' ? 'rookie: draft-slot average' : 'no NBA history: replacement level';
        return `<tr>
        <td class="rank">${i + 1}</td>
        <td><a href="#splayer/${p.pid}">${esc(p.name)}</a>${p.exp === 'R' ? ' <span class="pill OK">ROOKIE</span>' : ''}${p.tw ? ' <span class="pill N_A">TWO-WAY</span>' : ''}${p.breakout ? ' <span class="pill GOOD" title="Young, projected for a real role, and a big jump in impact or minutes">BREAKOUT?</span>' : ''}${p.strong_finish ? ` <span class="pill GOOD" title="Game score per 36 over his last ${p.late.n} games: ${p.late.gmsc36_late} vs ${p.late.gmsc36} for the season">STRONG FINISH</span>` : ''}${p.regression ? ' <span class="pill BAD" title="Minutes per game fell below 75% of the season before (a demotion, not injuries), so no development bump">REGRESSION?</span>' : ''}
          <div class="rk">${esc(note)} · ${esc(p.mp_basis)}</div>
          ${c ? `<div class="rk">${esc(c.season)} ${esc(c.college || '')}: ${(c.pts40).toFixed(1)} pts, ${(c.trb40).toFixed(1)} reb, ${(c.ast40).toFixed(1)} ast per 40 · ${(c.ts * 100).toFixed(1)}% TS</div>` : ''}</td>
        <td class="num">${p.age ?? '–'}</td>
        <td class="num">${esc(p.pos || '–')}</td>
        <td class="hide-sm small">${p.last ? `${p.last.team === 'TOT' ? 'multiple teams' : p.last.team}: ${p.last.g ?? '?'} g, ${p.last.mp} min, BPM ${sgn(p.last.bpm, 1)}${p.last.epm != null ? `, EPM ${sgn(p.last.epm, 1)}` : ''}` : '<span class="muted">did not play</span>'}</td>
        <td class="num">${p.g}</td>
        <td class="num strong">${p.mpg}</td>
        <td class="num hide-sm">${p.mp.toLocaleString()}</td>
        <td class="num ${zCls(p.bpm / 1.5)}">${sgn(p.bpm, 1)}</td>
        <td class="num strong">${sgn(p.contrib)}</td></tr>`;
      }).join('')}
      <tr class="sum"><td></td><td>Team</td><td></td><td></td><td class="hide-sm"></td><td></td><td></td>
        <td class="num hide-sm">${t.players.reduce((a, p) => a + p.mp, 0).toLocaleString()}</td><td></td><td class="num strong" title="Roster projection (the players' contributions add up to this)">${sgn(t.roster_net)}</td></tr></tbody></table></div>
    <p class="small muted">Contributions add up to the roster projection (${sgn(t.roster_net)}). The expectation score blends it 75/25 with the team's actual net rating last season (${t.last_net == null ? '–' : sgn(t.last_net)} vs league average), which tracks real results better in the backtest.</p>
    ${P.college_model ? `<p class="small muted">College model: fitted on ${P.college_model.samples} past draftees; typical error ${P.college_model.mae_model} BPM vs ${P.college_model.mae_prior} for draft slot alone (leave-one-draft-year-out) — ${P.college_model.used ? 'used for rookies with college stats' : 'not better than draft slot, so not used'}.</p>` : ''}
    ${bt.length ? `<p class="small muted">Backtest (past seasons rebuilt from each season's roster with projected minutes): correlation with real net rating ${bt.map(r => `${seasonLabel(r.season)} ${r.corr}`).join(', ')}; typical miss ${bt.map(r => r.mae_net).join(' / ')} points.</p>` : ''}
    ${projProfileSection(t, P)}
    ${projDepthSection(t, P)}`;
}

/* ---------- projected roster profile + brittleness (Outlook team page) ---------- */
function fmtPlayerRate(key, v) {
  if (v == null) return '–';
  if (key === 'ppp' || key === 'drtg') return v.toFixed(1);
  if (['ts', '3par'].includes(key)) return (v * 100).toFixed(1) + '%';
  if (key === 'ftr') return v.toFixed(3);
  return v.toFixed(1) + '%';
}
const rankClass = (rank, n) => rank <= 10 ? 'z-g' : rank > n - 10 ? 'z-b' : '';   // top 10 green, bottom 10 red
function projProfileSection(t, P) {
  const pr = t.profile, M = P.profile_metrics, n = P.teams.length;
  if (!pr || !pr.cats) return '';
  const list = xs => xs.map(x => `<b>${esc(x.noun)}</b> <span class="muted">(#${x.rank}/${n})</span>`).join(', ');
  const sg = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  return `<h3>Projected roster profile</h3>
    <p class="lede">What this rotation should be good and bad at, from each player's recent individual rates (last three seasons, recency-weighted; players with no NBA history get last season's average for their position group) weighted by his projected minutes (shooting, turnovers, foul drawing, 3-point volume and points per possession also by usage). Points per possession and points allowed use individual offensive and defensive ratings (per 100 possessions); the other rates are the average player on the floor. Each cell is ranked against the other ${n - 1} projected rosters: top 10 green, bottom 10 red. 3PT volume is the share of shots that are threes (3PA / FGA), not the raw number of threes.</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Projected strengths</div><div class="small">${pr.strengths.length ? list(pr.strengths) : '<span class="muted">none in the top third</span>'}</div></div>
      <div class="tile"><div class="k">Projected weaknesses</div><div class="small">${pr.weaknesses.length ? list(pr.weaknesses) : '<span class="muted">none in the bottom third</span>'}</div></div>
      <div class="tile"><div class="k">Overall level</div><div class="v">#${pr.level_rank} / ${n}</div><div class="small muted">average z ${sg(pr.level)}</div></div>
    </div>
    <div class="table-wrap"><table class="style-table"><thead><tr><th></th>${M.map(m => `<th class="num" title="${m.higher_better ? 'Higher is better' : 'Lower is better'}">${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Projected</td>${M.map(m => { const c = pr.cats[m.key]; return c ? `<td class="num ${rankClass(c.rank, n)}" title="z ${sg(c.z)} vs the other projected rosters">${fmtPlayerRate(m.key, c.v)}<div class="rk">#${c.rank}</div></td>` : '<td class="num">–</td>'; }).join('')}</tr>
    </tbody></table></div>`;
}
function projDepthSection(t, P) {
  const dp = t.depth, M = P.profile_metrics, n = P.teams.length;
  if (!dp || !dp.cats || dp.score == null) return '';
  const sg = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  const list = xs => xs.map(x => `<b>${esc(x.noun)}</b> <span class="muted">(#${x.rank}/${n})</span>`).join(', ');
  const pz = (p, k) => { const v = p.z[k]; if (v == null) return '<td class="num">–</td>';
    const cut = p.omitted.includes(k); return `<td class="num ${cut ? 'muted' : zClass(v)}">${cut ? '<s>' + sg(v) + '</s>' : sg(v)}</td>`; };
  return `<h3>Projected roster brittleness</h3>
    <p class="lede">The GM-page brittleness test applied to this projection: every player projected for 15+ games and 10+ minutes a game, his recent rates compared with his position group (guards, wings, bigs) league-wide last season (z-score, + is better). In each category the <b>top two are left out</b> and the rest averaged, then ranked against the other projected rosters. Struck-through values are the top two; <i>est.</i> marks players with no NBA history (position average).</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Depth rank</div><div class="v">#${dp.rank} / ${n}</div><div class="small muted">${dp.rank <= n / 3 ? 'deep (least brittle)' : dp.rank > n * 2 / 3 ? 'top-heavy (brittle)' : 'middle of the pack'} · depth score ${sg(dp.score)}</div></div>
      <div class="tile"><div class="k">Depth strengths</div><div class="small">${dp.strengths.length ? list(dp.strengths) : '<span class="muted">none in the top third</span>'}</div></div>
      <div class="tile"><div class="k">Depth weaknesses</div><div class="small">${dp.weaknesses.length ? list(dp.weaknesses) : '<span class="muted">none in the bottom third</span>'}</div></div>
    </div>
    <div class="table-wrap"><table class="style-table"><thead><tr><th>Player</th><th class="num">G</th><th class="num">Min/g</th>${M.map(m => `<th class="num">${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      ${dp.players.map(p => `<tr><td class="nowrap">${esc(p.name)} <span class="muted small">${esc(p.pos || '')}${p.est ? ' · est.' : ''}</span></td><td class="num">${p.g}</td><td class="num">${p.mpg}</td>${M.map(m => pz(p, m.key)).join('')}</tr>`).join('')}
      <tr class="sum"><td>Average without the top two</td><td></td><td></td>${M.map(m => { const c = dp.cats[m.key]; return c ? `<td class="num strong ${rankClass(c.rank, n)}">${sg(c.v)}<div class="rk">#${c.rank}</div></td>` : '<td></td>'; }).join('')}</tr>
    </tbody></table></div>`;
}

async function renderInjuries() {
  const view = $('#view');
  const P = await getJSON('data/projection.json');
  const rows = P.injuries || [];
  view.innerHTML = `<a class="back" href="#outlook">← Outlook</a>
    <h2>Severe injuries, ${seasonLabel(P.season)}</h2>
    <p class="lede">Long-term injuries built into the Outlook: who is out, the nature of the injury, the estimated return and how many games he is projected to play. Games missed by the return date = days after opening night × 82/170. Some calls are set by hand and are deliberately pessimistic (recurring or unexplained injuries, older players coming back from major surgery). The minutes they miss go to teammates. Sources: team reports and ESPN's injury tracker; return dates move, so this is a snapshot.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Team</th><th>Player</th><th>Injury</th><th class="num">Est. return</th><th class="num" title="Games missed by the estimated return date">Games missed</th><th class="num">Projected games</th><th class="num">Min / game</th><th class="hide-sm">Last season</th></tr></thead>
      <tbody>${rows.map(i => `<tr>
        <td><span class="team-tag">${i.team}</span><a href="#outlook/${i.team}">${esc(i.team)}</a></td>
        <td class="strong">${esc(i.player)}${i.note ? `<div class="rk">${esc(i.note)}</div>` : ''}</td>
        <td>${esc(i.injury)}</td>
        <td class="num nowrap">${i.out_for_season ? '<span class="pill VERY_BAD">OUT FOR SEASON</span>' : i.est_return ? fmtDate(i.est_return) : '–'}</td>
        <td class="num">${i.missed ?? '–'}</td>
        <td class="num strong">${i.games ?? '–'}${i.set_games ? ' <span class="rk" title="Set by hand (pessimistic)">set</span>' : ''}</td>
        <td class="num">${i.mpg ?? '–'}</td>
        <td class="hide-sm small">${i.last ? `${i.last.g} g, ${i.last.mpg} min/g, BPM ${sgn(i.last.bpm, 1)}` : '<span class="muted">did not play</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- this season, game by game (2026-27 Teams tab) ---------- */
const gradeCls = g => !g || g === 'N/A' ? 'N_A' : g[0] === 'A' ? 'VERY_GOOD' : g === 'B+' || g === 'B' ? 'GOOD' : g === 'B-' || g === 'C+' ? 'OK' : g[0] === 'C' ? 'BAD' : 'VERY_BAD';
const gradePill = g => `<span class="pill ${gradeCls(g)}">${esc(g || 'N/A')}</span>`;
const gameLabel = g => `${g.away} ${g.away_pts} @ ${g.home} ${g.home_pts}`;
async function seasonData() { return S._season || (S._season = await getJSON('data/season/season.json')); }
function teamSelect(Z, team) {
  return `<label class="small">Team <select id="season-team"><option value="">All teams</option>${[...Z.teams].sort((a, b) => a.team_name.localeCompare(b.team_name)).map(t => `<option value="${t.team}"${t.team === team ? ' selected' : ''}>${esc(t.team_name)}</option>`).join('')}</select></label>`;
}
function bindTeamSelect(view) {
  const sel = view.querySelector('#season-team');
  if (sel) sel.addEventListener('change', () => { location.hash = sel.value ? `#season/${sel.value}` : '#season'; });
}
function gamesTable(games, team) {
  let run = 0;
  const tally = {};
  if (team) [...games].reverse().forEach(g => { run += (g.home === team ? 1 : -1) * g.diff; tally[g.id] = run; });
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Game</th><th class="num" title="Expected home margin (points), from the players who played and their minutes, plus home court">Expected (home)</th><th class="num">Actual (home)</th>
    <th class="num" title="Actual - expected margin; + = ${team ? 'this team' : 'home team'} beat its expectation">${team ? 'Over / under' : 'Home over / under'}</th>${team ? '<th class="num">Coach tally</th>' : ''}<th class="num hide-sm" title="Injury score: what absent rotation players would have added over replacement (points per 100)">Injuries (away / home)</th></tr></thead><tbody>
    ${games.map(g => { const d = team && g.away === team ? -g.diff : g.diff; return `<tr class="link" data-href="#game/${g.id}">
      <td class="nowrap">${fmtDate(g.date)}</td><td class="nowrap"><a href="#game/${g.id}">${esc(gameLabel(g))}</a></td>
      <td class="num">${sgn(g.exp_margin, 1)}</td><td class="num">${sgn(g.margin, 0)}</td>
      <td class="num strong ${zCls(d / 4)}">${sgn(d, 1)}</td>${team ? `<td class="num">${sgn(tally[g.id], 1)}</td>` : ''}
      <td class="num hide-sm">${g.inj_away.toFixed(1)} / ${g.inj_home.toFixed(1)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
async function renderSeason(team) {
  const view = $('#view');
  const Z = await seasonData();
  const lede = `<p class="lede">Every ${seasonLabel(Z.season)} game, newest first, updated nightly (2 AM Pacific). Each team's <b>expectation</b> uses the players who actually played and their minutes: each player's expected impact is his Outlook projection (last three seasons, recency- and games-weighted; rookies from draft slot and college stats), blended with his box-score impact this season once he has ${Z.min_games} games (games ÷ (games + ${Z.season_k})). Expected margin = home − away + ${Z.home_edge} for home court. <b>Coach score</b> adds up actual − expected margins for his team (points), so + means the team beat what its players should have produced. The <b>injury score</b> adds up what absent rotation players would have added over a replacement-level fill-in. Click a game for its box score and player grades.</p>`;
  if (!team) {
    view.innerHTML = `<h2>${seasonLabel(Z.season)} Teams</h2>${lede}
      <div class="toolbar">${teamSelect(Z)} <span class="small muted">Updated ${esc(Z.updated.replace('T', ' '))} · ${Z.games.length} games</span></div>
      <h3>Teams by coach score (over / under expectation)</h3>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>Coach</th><th class="num">Record</th><th class="num">Coach score</th><th class="num">Per game</th><th class="num">Injury score</th><th class="hide-sm">Top grade</th></tr></thead><tbody>
      ${Z.teams.filter(t => t.games).map(t => `<tr class="link" data-href="#season/${t.team}"><td class="rank">${t.coach_rank}</td>
        <td class="name"><span class="team-tag">${t.team}</span><a href="#season/${t.team}">${esc(t.team_name)}</a></td><td>${esc(t.coach || '–')}</td>
        <td class="num">${t.w}-${t.l}</td><td class="num strong ${zCls(t.coach_score / 8)}">${sgn(t.coach_score, 1)}</td><td class="num">${sgn(t.coach_per_game, 1)}</td>
        <td class="num">${t.injury_score.toFixed(1)}</td><td class="hide-sm">${t.players[0] ? `<a href="#splayer/${t.players[0].pid}">${esc(t.players[0].name)}</a> ${gradePill(t.players[0].grade)}` : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3>Injury score (most injured first)</h3>
      <p class="lede">What each team's absent rotation players (projected 12+ min/game) would have added over a replacement-level fill-in, added up over every game (points per 100).</p>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th class="num">Injury score</th><th class="num">Per game</th><th class="num">Record</th></tr></thead><tbody>
      ${[...Z.teams].filter(t => t.games).sort((a, b) => a.injury_rank - b.injury_rank).map(t => `<tr class="link" data-href="#season/${t.team}"><td class="rank">${t.injury_rank}</td>
        <td class="name"><span class="team-tag">${t.team}</span><a href="#season/${t.team}">${esc(t.team_name)}</a></td>
        <td class="num strong">${t.injury_score.toFixed(1)}</td><td class="num">${(t.injury_score / t.games).toFixed(2)}</td><td class="num">${t.w}-${t.l}</td></tr>`).join('')}</tbody></table></div>
      <h3>Top ${(Z.top_players || []).length} players by season score</h3>
      <p class="lede">Minutes-weighted average grade score over every graded game this season (10+ minutes)${Z.top_min_games > 1 ? `; at least ${Z.top_min_games} graded games` : ''}.</p>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="num">Games</th><th class="num">Min / game</th><th class="num">Score</th><th>Grade</th><th>Off</th><th>Def</th></tr></thead><tbody>
      ${(Z.top_players || []).map((p, i) => `<tr class="link" data-href="#splayer/${p.pid}"><td class="rank">${i + 1}</td><td><a href="#splayer/${p.pid}">${esc(p.name)}</a></td>
        <td><span class="team-tag">${p.team}</span></td><td class="num">${p.graded}</td><td class="num">${p.mpg}</td><td class="num strong">${sgn(p.score, 1)}</td><td>${gradePill(p.grade)}</td><td>${gradePill(p.off_grade)}</td><td>${gradePill(p.def_grade)}</td></tr>`).join('')}</tbody></table></div>
      <h3>Games</h3>${gamesTable(Z.games)}`;
    bindTeamSelect(view);
    bindRowLinks(view);
    return;
  }
  const t = Z.teams.find(x => x.team === team);
  const games = Z.games.filter(g => g.home === team || g.away === team);
  const of = Z.teams.filter(x => x.games).length;
  view.innerHTML = `<a class="back" href="#season">← ${seasonLabel(Z.season)} Teams</a>
    <div class="hero"><div class="who"><h2>${esc(t.team_name)}</h2><p>${seasonLabel(Z.season)} · coach ${esc(t.coach || '–')} · <a href="#outlook/${team}">Outlook</a></p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">Record</div><div class="v">${t.w}-${t.l}</div></div>
        <div class="tile"><div class="k">Coach score</div><div class="v">${sgn(t.coach_score, 1)}</div><div class="small muted">${t.coach_rank ? `#${t.coach_rank} of ${of} coaches` : 'no games yet'} · ${sgn(t.coach_per_game, 1)} per game</div></div>
        <div class="tile"><div class="k">Injury score</div><div class="v">${t.injury_score.toFixed(1)}</div><div class="small muted">${t.injury_rank ? `#${t.injury_rank} of ${of} most injured` : ''} · adds up over the season</div></div>
      </div></div>
    <div class="toolbar">${teamSelect(Z, team)}</div>
    <h3>Games</h3>${games.length ? gamesTable(games, team) : '<p class="empty">No games yet.</p>'}
    <h3>Players by grade</h3>
    <p class="lede">Each player's season grade is his minutes-weighted average game score (games with ${10}+ minutes); click a player for every game.</p>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th class="num">Games</th><th class="num">Min / game</th><th class="num">Score</th><th>Grade</th><th>Off</th><th>Def</th></tr></thead><tbody>
      ${t.players.map((p, i) => `<tr class="link" data-href="#splayer/${p.pid}"><td class="rank">${i + 1}</td><td><a href="#splayer/${p.pid}">${esc(p.name)}</a></td><td class="num">${p.games}</td><td class="num">${p.mpg}</td><td class="num">${p.score == null ? '–' : sgn(p.score, 1)}</td><td>${gradePill(p.grade)}</td><td>${gradePill(p.off_grade)}</td><td>${gradePill(p.def_grade)}</td></tr>`).join('')}</tbody></table></div>`;
  bindTeamSelect(view);
  bindRowLinks(view);
}
async function renderGame(id) {
  const view = $('#view');
  const g = await getJSON(`data/season/games/${id}.json`);
  const side = tm => {
    const T = g.teams[tm];
    return `<h3><span class="team-tag">${tm}</span><a href="#season/${tm}">${esc(tm)}</a> <span class="small muted">expectation ${sgn(tm === g.home ? g.exp_home : g.exp_away, 1)} · coach ${esc((tm === g.home ? g.coach_home : g.coach_away) || '–')}</span></h3>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num hide-sm">Stl</th><th class="num hide-sm">Blk</th><th class="num hide-sm">TO</th><th class="num">+/−</th>
        <th class="num" title="Game impact on the BPM scale (estimated from game score per 36)">Game impact</th><th class="num" title="Expected impact going in">Expected</th><th>Grade</th><th title="Offense grade: scoring, efficiency, free throws drawn, assists, offensive boards, turnovers vs his expected offense">Off</th><th title="Defense grade: defensive boards, steals, blocks, fouls and +/-, vs his expected defense and how his positional counterparts scored against their expectations">Def</th></tr></thead><tbody>
      ${T.rows.map(r => r.mp > 0 ? `<tr><td class="nowrap"><a href="#splayer/${r.pid}">${esc(r.name)}</a>${r.starter ? '' : ' <span class="muted small">bench</span>'}</td><td class="num">${r.mp.toFixed(0)}</td><td class="num">${r.pts}</td><td class="num">${r.trb}</td><td class="num">${r.ast}</td><td class="num hide-sm">${r.stl}</td><td class="num hide-sm">${r.blk}</td><td class="num hide-sm">${r.tov}</td>
        <td class="num">${sgn(r.pm, 0)}</td><td class="num">${r.bpm == null ? '–' : sgn(r.bpm, 1)}</td><td class="num">${sgn(r.exp, 1)}</td>
        <td title="${r.parts ? `box ${sgn(r.parts.bpm, 1)}, vs expectation ${sgn(r.parts.vs_exp, 1)}, +/- vs team ${sgn(r.parts.pm_rel, 1)}, counterparts ${sgn(r.parts.counterparts, 1)}` : 'under 10 minutes'}">${gradePill(r.grade)}${r.score != null ? ` <span class="rk">${sgn(r.score, 1)}</span>` : ''}</td>
        <td title="${r.off != null ? `offensive impact ${sgn(r.off, 1)} vs expected ${sgn(r.exp_off, 1)}` : ''}">${gradePill(r.off_grade)}</td>
        <td title="${r.def_parts ? `defensive impact ${sgn(r.def_parts.def, 1)}, vs expected ${sgn(r.def_parts.vs_exp, 1)}, counterparts' offense vs expected ${sgn(r.def_parts.counterparts_off, 1)}` : ''}">${gradePill(r.def_grade)}</td></tr>`
        : `<tr class="muted"><td>${esc(r.name)}</td><td colspan="13" class="small">${esc(r.dnp || 'Did not play')}</td></tr>`).join('')}</tbody></table></div>
      ${T.absent.length ? `<p class="small">Missing rotation players (injury score ${(tm === g.home ? g.inj_home : g.inj_away).toFixed(1)}): ${T.absent.map(a => `${esc(a.name)} <span class="muted">(${a.mpg} min/g, impact ${sgn(a.impact, 1)})</span>`).join(', ')}</p>` : ''}`;
  };
  view.innerHTML = `<a class="back" href="#season">← Games</a>
    <div class="hero"><div class="who"><h2>${esc(gameLabel(g))}</h2><p>${fmtDate(g.date)}</p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">Expected</div><div class="v">${g.exp_margin >= 0 ? g.home : g.away} by ${Math.abs(g.exp_margin).toFixed(1)}</div></div>
        <div class="tile"><div class="k">Actual</div><div class="v">${g.margin >= 0 ? g.home : g.away} by ${Math.abs(g.margin)}</div></div>
        <div class="tile"><div class="k">Over / under</div><div class="v">${g.diff >= 0 ? g.home : g.away} ${sgn(Math.abs(g.diff), 1)}</div><div class="small muted">added to ${esc(g.coach_home || g.home)} (${sgn(g.diff, 1)}) and ${esc(g.coach_away || g.away)} (${sgn(-g.diff, 1)})</div></div>
      </div></div>
    <p class="lede">Grades (10+ minutes): 0.55 × his game impact (so a great box score earns an A whoever he is) + 0.30 × game impact vs his expectation + 0.15 × his +/− per 36 relative to his team's margin − 0.20 × how far his positional counterparts (same position group, similar minutes) beat their own expectations. A game impact of +12 or game score 28+ is at least an A−. <b>Off</b> grades purely offensive box stats (scoring, efficiency, free throws drawn, assists, offensive boards, turnovers) against his expected offense. <b>Def</b> grades defensive boards, steals, blocks, fouls and +/−, against his expected defense, and docks him when his positional counterparts scored better than expected on him (credits him when they did worse). Hover a grade for its parts.</p>
    ${side(g.away)}${side(g.home)}`;
}
const ordinal = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'}[n % 10] || 'th'));

const ageNow = (draftAge, year) => draftAge == null ? null : draftAge + (Date.now() - new Date(year, 5, 25)) / (365.25 * 864e5);   // draft night ~ June 25
let BIRTHS = {};
let BODIES = {}, SAL = null, SALBY = {};
const BIRTHS_P = Promise.all([getJSON('data/births.json').then(b => { BIRTHS = b; }).catch(() => {}), getJSON('data/bodies.json').then(b => { BODIES = b; }).catch(() => {}),
  getJSON('data/salary.json').then(b => { SAL = b; b.players.forEach(r => { SALBY[r.pid] = r; }); }).catch(() => {})]);
const SAL_CLS = { 'Great value': 'VERY_GOOD', 'Good value': 'GOOD', 'Right-sized': 'OK', 'Bad value': 'BAD', 'Very bad value': 'VERY_BAD',
  Bargain: 'VERY_GOOD', 'Team-friendly': 'GOOD', 'Fair deal': 'OK', Overpaid: 'BAD', 'Toxic contract': 'VERY_BAD' };
const salPill = l => l ? `<span class="pill ${SAL_CLS[l] || 'OK'}">${esc(l)}</span>` : '';
const CHIP = 'Expiring contract / trade chip', FA = 'Prospective free agents', PRONE = 'Injury prone';
const chipPill = c => c && c.expiring ? `<span class="pill CHIP" title="Overpaid, but off the books after ${seasonLabel(SAL.season)}: a big expiring salary to match in trades">${CHIP}</span>` : '';
const optTxt = o => ({ PO: 'player option', TO: 'team option', ETO: 'early termination option' })[o] || '';
const salaryLine = pid => { const r = pid && SALBY[pid]; if (!r) return '';
  if (!r.contract) return `<p class="age-line">${r.tw ? 'Two-way contract' : 'No standard contract on file'}</p>`;
  const c = r.contract, opts = c.options.map(o => `${seasonLabel(o.season)} ${optTxt(o.option)}${o.decision ? ` (${o.decision})` : ''}`);
  return `<p class="age-line">${money(c.salary)} this season (${c.share}% of the cap) · ${c.years_left} year${c.years_left === 1 ? '' : 's'} left, ${money(c.total_money)} total${opts.length ? ` · ${esc(opts.join(', '))}` : ''} · ${salPill(c.label)} ${c.tag !== 'Fair deal' ? salPill(c.tag) : ''} ${chipPill(c)}${c.free_agent && !c.expiring ? ` <span class="muted small">free agent after ${seasonLabel(SAL.season)}</span>` : ''}</p>`; };
function salaryBlock(pid) {
  const r = pid && SALBY[pid];
  if (!r) return '';
  if (!r.contract) return `<h3>Salary</h3><p class="muted">${r.tw ? 'On a two-way contract (not counted against the cap).' : `No standard contract on file for ${seasonLabel(SAL.season)}.`}</p>`;
  const c = r.contract;
  const verdict = c.diff >= 4 ? `worth about ${c.fair}% of the cap, ${c.diff} points more than he is paid` : c.diff <= -4 ? `worth about ${c.fair}% of the cap, ${-c.diff} points less than he is paid` : `paid about what he is worth (${c.fair}% of the cap)`;
  return `<h3>Salary</h3>
    <div class="stat-tiles"><div class="tile"><div class="k">${seasonLabel(SAL.season)} salary</div><div class="v">${money(c.salary)}</div><div class="small muted">${c.share}% of the ${money(SAL.cap)} cap</div></div>
      <div class="tile"><div class="k">This season</div><div class="v">${salPill(c.label)}</div><div class="small muted">${verdict}</div></div>
      <div class="tile"><div class="k">Whole contract</div><div class="v">${salPill(c.tag)}</div><div class="small muted">${c.total_diff >= 0 ? '+' : ''}${c.total_diff} cap points over the ${c.expected_years} season${c.expected_years === 1 ? '' : 's'} it likely runs · ${money(c.total_money)} on the books</div></div>
      ${c.free_agent ? `<div class="tile"><div class="k">After this season</div><div class="v">${c.expiring ? chipPill(c) : '<span class="pill OK">Free agent</span>'}</div><div class="small muted">${c.expiring ? `overpaid, but his ${money(c.salary)} comes off the books after ${seasonLabel(SAL.season)}: useful salary to match in a trade` : `prospective free agent after ${seasonLabel(SAL.season)}`}</div></div>` : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>Season</th><th class="num">Salary</th><th class="num">% of cap</th><th class="num">Worth (% of cap)</th><th class="num">Value</th><th>Option</th><th class="num hide-sm">Projected impact</th></tr></thead><tbody>
      ${c.years.map(y => `<tr${y.counts ? '' : ' class="muted"'}><td>${seasonLabel(y.season)}</td><td class="num">${money(y.salary)}</td><td class="num">${y.share}%</td><td class="num">${y.fair}%</td>
        <td class="num ${y.diff >= 4 ? 'd-col-green' : y.diff <= -4 ? 'd-col-red' : ''}">${y.diff > 0 ? '+' : ''}${y.diff}</td><td>${y.option ? `${optTxt(y.option)}${y.decision ? ` · <i>${esc(y.decision)}</i>` : ''}` : (y.counts ? '' : 'after the contract likely ends')}</td><td class="num hide-sm">${sgn(y.bpm, 1)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Worth = the minimum plus his projected VORP ((impact + 2) × projected minutes ÷ 3,936; impact is his Outlook BPM/EPM blend over his last three seasons, recent ones weighted more, and minutes are cut for injuries) at the league's going rate: ${SAL.rate}% of the cap per VORP, what veterans are paid above the minimum. Later seasons age his impact and assume the cap grows ${Math.round((SAL.cap_growth - 1) * 100)}% a year. Team options are picked up only if he's worth it; player options are taken only if he's overpaid. Value labels: great value 10+ cap points under his worth, good 4–10, right-sized within 4, bad 4–10 over, very bad 10+ over. <a href="#salary">All salaries →</a></p>`;
}
const INJ_CLS = { 'Injury prone': 'VERY_BAD', 'Missed time': 'BAD', Durable: 'GOOD' };
const injPill = l => l ? `<span class="pill ${INJ_CLS[l]}">${esc(l)}</span>` : '';
function injuryBlock(pid) {
  const a = pid && SALBY[pid] && SALBY[pid].avail;
  if (!a) return '';
  const cur = a.current;
  return `<h3>Injuries</h3>
    ${cur ? `<p><b>Current:</b> ${esc(cur.injury)}${cur.est_return ? ` · ${cur.est_return === 'season' ? 'out for the season' : `estimated return ${fmtDate(cur.est_return)}`}` : ''}${cur.note ? ` <span class="muted">(${esc(cur.note)})</span>` : ''}</p>` : ''}
    ${a.seasons.length ? `<div class="stat-tiles"><div class="tile"><div class="k">Last ${a.seasons.length} season${a.seasons.length === 1 ? '' : 's'}</div><div class="v">${a.pct}% missed</div><div class="small muted">${a.missed} of ${a.available} games ${injPill(a.label)}</div></div></div>
    <div class="table-wrap"><table><thead><tr><th>Season</th><th class="num">Games played</th><th class="num">Missed</th><th class="num">% missed</th></tr></thead><tbody>
      ${a.seasons.map(x => `<tr><td>${seasonLabel(x.season)}</td><td class="num">${x.g} of ${x.of}</td><td class="num">${x.of - x.g}</td><td class="num ${x.g / x.of <= 0.7 ? 'd-col-red' : ''}">${Math.round(100 * (x.of - x.g) / x.of)}%</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">No full NBA season yet to judge availability.</p>'}
    <p class="small muted">Games missed out of 82 in each of the last three seasons, counted from his first 40-game season (a season missed entirely counts). Injury prone = ${SAL.injury.prone}%+ missed over 2+ seasons, missed time = ${SAL.injury.some}%+, durable = ${SAL.injury.durable}% or less (rotation players, 20+ min a game). Missed games also include rest, suspensions and coach's decisions: our sources (Basketball-Reference game logs say only "Inactive") don't record the injury behind each one, so only current long-term injuries (from team reports and ESPN's tracker) are named.</p>`;
}
function renderSalary() {
  const view = $('#view');
  if (!SAL) { view.innerHTML = '<p class="empty">No salary data yet.</p>'; return; }
  const f = state.sal = Object.assign({ label: '', team: '' }, state.sal || {});
  const teams = [...new Set(SAL.players.map(r => r.team))].sort();
  const draw = () => {
    let rows = SAL.players.filter(r => (f.label === PRONE ? r.avail && r.avail.label === PRONE : r.contract) && (!f.team || r.team === f.team) && (!f.label || f.label === PRONE || r.contract.label === f.label || r.contract.tag === f.label
      || (f.label === CHIP && r.contract.expiring) || (f.label === FA && r.contract.free_agent)));
    if (f.label === PRONE) rows = [...rows].sort((a, b) => b.avail.pct - a.avail.pct);
    const avCell = r => { const a = r.avail; return a && a.pct != null ? `${a.missed}/${a.available} (${a.pct}%)${a.label && a.label !== 'Durable' ? ' ' + injPill(a.label) : ''}${a.current ? `<br><span class="small">${esc(a.current.injury)}</span>` : ''}` : '<span class="muted">–</span>'; };
    $('#sal-body').innerHTML = rows.map((r, i) => { const c = r.contract || { salary: null, share: '–', fair: '–', diff: 0, options: [], years_left: '–', expected_years: '–' }; return `<tr class="link" data-href="#splayer/${r.pid}"><td class="rank">${i + 1}</td><td><a href="#splayer/${r.pid}">${esc(r.name)}</a></td><td>${r.team}</td><td class="num">${r.age ?? '–'}</td>
      <td class="num">${money(c.salary)}</td>${r.contract ? `<td class="num strong">${c.share}%</td><td class="num">${c.fair}%</td><td class="num ${c.diff >= 4 ? 'd-col-green' : c.diff <= -4 ? 'd-col-red' : ''}">${c.diff > 0 ? '+' : ''}${c.diff}</td>` : `<td colspan="3" class="small muted">${r.tw ? 'two-way contract' : 'no standard contract on file'}</td>`}
      <td>${salPill(c.label)}</td><td>${salPill(c.tag)}${c.expiring ? '<br>' + chipPill(c) : ''}</td><td class="num hide-sm">${c.years_left}${c.expected_years !== c.years_left ? ` <span class="muted small">(likely ${c.expected_years})</span>` : ''}</td><td class="small hide-sm">${c.options.map(o => `${seasonLabel(o.season)} ${o.option}${o.decision ? ': ' + esc(o.decision) : ''}`).join('<br>')}</td><td class="small hide-sm">${avCell(r)}</td></tr>`; }).join('') || '<tr><td colspan="13" class="empty">No players match.</td></tr>';
    $('#sal-count').textContent = `${rows.length} players`;
    bindRowLinks(view);
  };
  view.innerHTML = `<h2>Salary</h2>
    <p class="muted">Every ${seasonLabel(SAL.season)} contract as a share of the ${money(SAL.cap)} cap, against what the player is worth from our Outlook projection (impact over his last three seasons, recent ones weighted more, and minutes cut for injuries), at the league's going rate of ${SAL.rate}% of the cap per VORP. <b>Value</b> grades this season; <b>contract</b> grades every season it will likely run, aging his impact, with team options declined when he isn't worth them and player options picked up when he's overpaid. A <b>toxic contract</b> is overpaid now and by 15+ cap points over 2+ remaining seasons. <b>Prospective free agents</b> are off the books after ${seasonLabel(SAL.season)} (one year left, or likely one once options are decided); the overpaid ones are <b>expiring contracts / trade chips</b>: big salaries a team can match in a trade without taking on future money.</p>
    <div class="toolbar"><select id="sal-label" aria-label="Label"><option value="">All labels</option><optgroup label="This season">${SAL.labels.map(l => `<option ${f.label === l ? 'selected' : ''}>${l}</option>`).join('')}</optgroup><optgroup label="Whole contract">${SAL.tags.map(l => `<option ${f.label === l ? 'selected' : ''}>${l}</option>`).join('')}</optgroup><optgroup label="After this season">${[CHIP, FA].map(l => `<option ${f.label === l ? 'selected' : ''}>${l}</option>`).join('')}</optgroup><optgroup label="Availability">${`<option ${f.label === PRONE ? 'selected' : ''}>${PRONE}</option>`}</optgroup></select>
      <select id="sal-team" aria-label="Team"><option value="">All teams</option>${teams.map(t => `<option ${f.team === t ? 'selected' : ''}>${t}</option>`).join('')}</select> <span id="sal-count" class="muted small"></span></div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="num">Age</th><th class="num">Salary</th><th class="num">% of cap</th><th class="num" title="What his projected play is worth, as a share of the cap">Worth</th><th class="num" title="Worth minus paid, cap points">+/−</th><th>Value</th><th>Contract</th><th class="num hide-sm">Years</th><th class="hide-sm">Options</th><th class="hide-sm" title="Games missed of 82 over the last three seasons (from his first 40-game season)">Missed games</th></tr></thead><tbody id="sal-body"></tbody></table></div>`;
  $('#sal-label').addEventListener('change', e => { f.label = e.target.value; save(); draw(); });
  $('#sal-team').addEventListener('change', e => { f.team = e.target.value; save(); draw(); });
  draw();
}
const bodyLine = pid => { const b = pid && BODIES[pid]; if (!b) return ''; const [h, w, g, d, t] = b;
  return `<p class="age-line">${htFmt(h)}, ${w} lb · <span title="Build from weight vs what is typical for a ${g.toLowerCase()} his height on our draft boards (not body fat)">${t}</span> <span class="muted small">(${d === 0 ? 'typical' : `${Math.abs(d)} lb ${d > 0 ? 'heavier' : 'lighter'} than typical`} for a ${g.toLowerCase()} his height)</span></p>`; };
const ageFromBirth = pid => { const b = pid && BIRTHS[pid]; if (!b) return null; const d = new Date(b + 'T12:00:00'), n = new Date(); return n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0); };
const ageLine0 = (draftAge, year, fallback, pid) => { const ex = ageFromBirth(pid); if (ex != null) return `<p class="age-line">Age ${ex}${draftAge != null ? ` <span class="muted small">(${dnum(draftAge, 1)} at the ${year} draft)</span>` : ''}</p>`; const a = ageNow(draftAge, year); return a != null ? `<p class="age-line">Age ${Math.floor(a)} <span class="muted small">(${dnum(draftAge, 1)} at the ${year} draft)</span></p>` : fallback != null ? `<p class="age-line">Age ${fallback}</p>` : ''; };
const ageLine = (draftAge, year, fallback, pid) => ageLine0(draftAge, year, fallback, pid) + bodyLine(pid) + salaryLine(pid);
async function draftAge(pid) {
  try { const pr = (await getJSON('data/drafts/profiles.json'))[pid]; if (!pr) return null; const row = (await draftYear(pr.year)).rows.find(q => q.pid === pid); return row && row.Age != null ? { age: row.Age, year: pr.year } : null; } catch (e) { return null; }
}
async function renderSeasonPlayer(pid) {
  const view = $('#view');
  let p = null, proj = null;
  try { p = await getJSON(`data/season/players/${pid}.json`); } catch (e) { p = null; }
  try {
    const P = await getJSON('data/projection.json');
    for (const t of P.teams) { const q = t.players.find(x => x.pid === pid); if (q) { proj = { ...q, team: t.team, team_name: t.team_name, season: P.season }; break; } }
  } catch (e) { proj = null; }
  if (!p && !proj) {   // not on a 2026-27 roster: build the header from his tracking data
    const got = await styleByPid(pid);
    if (!got) { view.innerHTML = '<p class="empty">Player not found.</p>'; return; }
    const sp = got.p, ls = sp.seasons[sp.labels.season_year];
    proj = { name: sp.name, team: null, pos: sp.pos, none: true, last_team: ls.team, last_season: sp.labels.season_year };
  }
  const projTile = proj && !proj.none ? `<div class="tile"><div class="k">Outlook projection</div><div class="v">${proj.mpg} min/g</div><div class="small muted">${proj.g} games · impact ${sgn(proj.bpm, 1)} · contribution ${sgn(proj.contrib)}</div></div>` : '';
  let prof = null, I = null;
  let PD = null;
  try {
    prof = (await getJSON('data/drafts/profiles.json'))[pid]; I = await getJSON('data/drafts/index.json');
    if (prof) { PD = await draftYear(prof.year); prof = { ...prof, ...(PD.rows.find(q => q.pid === pid) || {}) }; }
  } catch (e) { prof = null; }
  if (!p) {   // no 2026-27 games yet (or not on a roster): projection, style, draft and salary sections
    const where = proj.none ? `${esc(proj.last_team || '')} <span class="muted">(last tracked ${seasonLabel(proj.last_season)}; not on a ${seasonLabel(S._season ? S._season.season : 2027)} roster)</span>`
      : `<span class="team-tag">${proj.team}</span><a href="#outlook/${proj.team}">${esc(proj.team_name)}</a>`;
    view.innerHTML = `${proj.none ? '<a class="back" href="#styles">← Player styles</a>' : `<a class="back" href="#outlook/${proj.team}">← ${esc(proj.team_name)} outlook</a>`}
      <div class="hero"><div class="who"><h2>${esc(proj.name)}</h2>${ageLine(prof && prof.Age, prof && prof.year, proj.age, pid)}<p>${where} · ${esc(proj.pos || '')}${proj.none ? '' : ` · no ${seasonLabel(proj.season)} games yet`} · <a href="https://www.basketball-reference.com/players/${pid[0]}/${pid}.html">Basketball-Reference</a></p></div>
        <div class="stat-tiles">${projTile}</div></div>
      <div id="sty-slot"></div>
      ${prof ? draftProfileBlock(prof, prof.year, I, PD) : ''}
      ${salaryBlock(pid)}${injuryBlock(pid)}`;
    styleSlot(view, pid);
    bindRowLinks(view);
    return;
  }
  view.innerHTML = `<a class="back" href="#season/${p.team}">← ${esc(p.team)}</a>${proj ? ` <a class="back" href="#outlook/${proj.team}">· ${esc(proj.team)} outlook</a>` : ''}
    <div class="hero"><div class="who"><h2>${esc(p.name)}</h2>${ageLine(prof && prof.Age, prof && prof.year, proj && proj.age, pid)}<p><span class="team-tag">${p.team}</span><a href="#season/${p.team}">${esc(p.team)}</a> · ${p.games} games, ${p.mpg} min/game</p></div>
      <div class="stat-tiles"><div class="tile"><div class="k">Season grade</div><div class="v">${gradePill(p.grade)}</div><div class="small muted">${p.score == null ? 'no graded games' : `score ${sgn(p.score, 1)} over ${p.graded} graded games`}</div></div>
        <div class="tile"><div class="k">Offense</div><div class="v">${gradePill(p.off_grade)}</div><div class="small muted">${p.off_score == null ? '' : `score ${sgn(p.off_score, 1)}`}</div></div>
        <div class="tile"><div class="k">Defense</div><div class="v">${gradePill(p.def_grade)}</div><div class="small muted">${p.def_score == null ? '' : `score ${sgn(p.def_score, 1)}`}</div></div>${projTile}</div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Game</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">+/−</th><th class="num">Game impact</th><th class="num">Expected</th><th>Grade</th><th>Off</th><th>Def</th></tr></thead><tbody>
      ${[...p.log].reverse().map(x => `<tr class="link" data-href="#game/${x.id}"><td class="nowrap">${fmtDate(x.date)}</td><td class="nowrap"><a href="#game/${x.id}">${x.home ? 'vs' : '@'} ${x.opp}</a> <span class="muted small">${x.result} ${sgn(x.margin, 0)}</span></td>
        <td class="num">${(x.mp || 0).toFixed(0)}</td><td class="num">${x.pts ?? '–'}</td><td class="num">${x.trb ?? '–'}</td><td class="num">${x.ast ?? '–'}</td><td class="num">${sgn(x.pm, 0)}</td><td class="num">${x.bpm == null ? '–' : sgn(x.bpm, 1)}</td><td class="num">${sgn(x.exp, 1)}</td><td>${gradePill(x.grade)}</td><td>${gradePill(x.off_grade)}</td><td>${gradePill(x.def_grade)}</td></tr>`).join('')}</tbody></table></div>
    <div id="sty-slot"></div>
    ${prof ? draftProfileBlock(prof, prof.year, I, PD) : ''}
    ${salaryBlock(pid)}${injuryBlock(pid)}`;
  bindRowLinks(view);
  styleSlot(view, pid);
}

/* ---------- NBA Drafts: Present and Past ---------- */
const dCls = st => !st ? '' : [st.fill && `d-fill-${st.fill}`, st.b && 'd-b', st.i && 'd-i', st.u && 'd-u', st.color && `d-col-${st.color}`].filter(Boolean).join(' ');
function colScale(rows, key) {          // the sheet's red-white-green scale (min / median / max of the class)
  const v = rows.map(r => r[key]).filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return () => '';
  const lo = v[0], mid = v[Math.floor(v.length / 2)], hi = v[v.length - 1];
  return x => {
    if (x == null) return '';
    const t = x >= mid ? (hi > mid ? (x - mid) / (hi - mid) : 0) : (mid > lo ? -(mid - x) / (mid - lo) : 0);
    const a = Math.min(1, Math.abs(t)) * 0.55;
    return `background: rgba(${t >= 0 ? '87,187,138' : '230,124,115'},${a.toFixed(2)})`;
  };
}
const dnum = (v, d = 2) => v == null ? '–' : Number(v).toFixed(d);
const htFmt = h => h ? `${Math.floor(h / 12)}'${(h % 12).toFixed(h % 1 ? 1 : 0)}"` : '–';
let draftCache = {};
async function draftYear(y) { return draftCache[y] || (draftCache[y] = await getJSON(`data/drafts/${y}.json`)); }
async function renderDrafts(year, sub) {
  const view = $('#view');
  const I = await getJSON('data/drafts/index.json');
  if (year === 'schools') return renderSchools(view, I, sub);
  if (year === 'reranks') return renderReranks(view, I, sub);
  // a single draft (its main board), all drafts' main boards together, or the Other section: early entrants
  // who withdrew (the trailing block on each board), with the board they turned up on next
  const mode = ['all', 'other', 'noncollege', 'backtoschool'].includes(year) ? year : 'one';
  year = mode === 'one' ? (Number(year) || I.years[0]) : year;
  const Ds = await Promise.all((mode === 'one' ? [year] : I.years).map(async y => [y, await draftYear(y)]));
  const R = Ds.flatMap(([y, D]) => D.rows.map((r, i) => Object.assign(r, { _y: y, _i: i })))
    .filter(r => mode === 'backtoschool' ? r.back_to_school : mode === 'other' ? r.other && !r.back_to_school : !r.other && (mode !== 'noncollege' || !r.college && !background(r).endsWith('matched)')));
  // each board in order of the model's class rank (#1 first); prospects without one keep the sheet's order after them
  const yi = Object.fromEntries(Ds.map(([y], i) => [y, i]));
  const cr = r => (r.pred && r.pred.class_rank) || Infinity;
  R.sort((a, b) => yi[a._y] - yi[b._y] || cr(a) - cr(b) || a._i - b._i);
  const M = I.model, multi = mode !== 'one';
  const colHelp = `<details class="col-help"><summary>What do these columns mean?</summary><dl>
    <dt>Class rank</dt><dd>The main ranking (the comparison columns below are hidden until you tick <i>Show comparison columns</i>). <b>VORP model</b>, pre-draft: our main ML model's predicted VORP per season over his first ${M ? M.years_out : 4} seasons, ranked within his class. Past classes are out-of-fold (predicted by a model that never saw that draft). Includes scout adjustments from your conditions (e.g. athletic wing creators and productive shooters up, small light guards and paint-bound bigs down) and your conditionals (stat and body combinations applied to every prospect who fits), all listed on each prospect's page.</dd>
    <dt>Rerank model</dt><dd><b>Second ML model</b>, pre-draft: same inputs, but trained to predict where a player ends up in his class's rerank. It retrains every build, so it follows the reranks as careers develop. It's the best of these at matching real reranks.</dd>
    <dt>Value set</dt><dd><b>Your scouting rules, not a separate model</b>: the VORP model's projection plus or minus your rules as points (shooting touch, self-creation, skill confluences, size and athleticism docks, school, team context, …). Hover a cell to see which rules fired.</dd>
    <dt>Hybrid</dt><dd><b>The blend</b>: the average of his Class rank, Rerank model rank and Value set rank, re-ranked within the class.</dd>
    <dt>Rerank</dt><dd><b>What actually happened</b>, not a prediction: where he reranks in his class so far on our rerank metric (career minutes, shrunk BPM and usage since the draft; see Draft reranks). Hover for his score vs his draft slot.</dd>
    <dt>All-class pct</dt><dd>His VORP-model projection as a percentile over every class 2016–2026.</dd>
    <dt>Model tier / Actual tier</dt><dd>The pre-draft projection as a tier (Superstar … Won't get the chance), and the same tiers applied to his real first ${M ? M.years_out : 4} NBA seasons (hover for his career tier).</dd>
    <dt>Lean</dt><dd>Whether the projected impact leans offense or defense (predicted OBPM vs DBPM).</dd>
  </dl></details>`;
  const has = k => R.some(r => r[k] != null);
  const nameCell = (r, i) => `<td class="name-cell"><a class="${dCls(r.style.name)}" href="#prospect/${r._y}/${r._i}">${esc(r.name)}</a></td>`;
  // first column: the model's class rank (the sheet's own # is not shown)
  const rankCell = r => r.pred && r.pred.class_rank ? `<td class="num rank" data-v="${r.pred.class_rank}">${r.pred.class_rank}<span class="muted small">/${r.pred.class_of}</span></td>` : '<td class="num rank" data-v="9999"><span class="muted">–</span></td>';
  const idHead = `<th class="num" title="Predicted VORP rank in his draft class (main board), with scout adjustments">Class rank</th><th>Name</th>${multi ? '<th class="num">Draft</th>' : ''}${mode === 'other' ? '<th class="num" title="The board he was on next (main section), if any">Next board</th>' : ''}${mode === 'noncollege' ? '<th title="Where he played before the draft (no college stats)">Background</th>' : ''}`;
  const idCells = (r, i) => `${rankCell(r)}${nameCell(r, i)}${multi ? `<td class="num" data-v="${r._y}"><a href="#drafts/${r._y}">${r._y}</a></td>` : ''}${mode === 'other' ? `<td class="num">${r.next_board ? `<a href="#drafts/${r.next_board}">${r.next_board}</a>` : '<span class="muted">–</span>'}</td>` : ''}${mode === 'noncollege' ? `<td class="nowrap small">${esc(background(r))}</td>` : ''}`;
  const head = (cols) => `<thead><tr>${idHead}${cols.map(c => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>`;
  const sc = k => colScale(R, k);
  const outcome = ['SStar', 'Star', 'Starter', 'GBench', 'Bench', 'DBench', 'Bust'].filter(has);
  const skills = ['OffEff', 'DefEff', ...I.skills, 'HgtC', 'Uniq'].filter(has);
  const scales = Object.fromEntries([...outcome, ...skills].map(k => [k, sc(k)]));
  const ratioKeys = ['SKILLSTARRAT', 'SKILLGLUERAT', 'SKILLOKRAT', 'SKILLBUSTRAT', 'PLYRSTARRAT', 'PLYRGLUERAT', 'PLYROKRAT', 'PLYRBUSTRAT', 'STARRATIO', 'GLUERATIO', 'OKRATIO', 'BUSTRATIO'].filter(has);
  const projKeys = ['Proj_Mins_BIN', 'Proj_Mins', 'Proj_WSBPM', 'USG%', 'ORtg', 'DRtg'].filter(has);
  const textKeys = ['NBAPROGRAM', 'SCHOOLRAT', 'RARITYARC', 'RARITY', 'PRO-CON', 'PROCONS', 'BODYPOS'].filter(k => R.some(r => r[k]));
  const L = I.legends;
  const legend = `<details class="card d-legend" style="padding:10px 14px;margin-bottom:14px"><summary class="strong">How to read the colors (from the sheet's notes)</summary><dl>
    <dt># (rank)</dt><dd>${esc(L.rank)}</dd><dt>Name</dt><dd>${esc(L.name)}</dd><dt>Age</dt><dd>${esc(L.age)}</dd><dt>Info</dt><dd>${esc(L.info)}</dd>
    <dt>Outcome probabilities, skills</dt><dd>Red → white → green within this draft class (lowest → median → highest), as in the sheet.</dd>
    ${projKeys.length ? `<dt>Projections</dt><dd>${esc(L.bin)} ${esc(L.proj)}</dd>` : ''}${ratioKeys.length ? `<dt>Ratios</dt><dd>${esc(L.ratios)}</dd>` : ''}
    <dt>Comparisons</dt><dd>Closest historical college/international profiles with their similarity (0-1). <b>{[Name]}</b> marks a height and weight match (the comparison was also his size coming out); other braces and brackets are kept from the sheet as written.</dd></dl></details>`;
  const modelNote = M ? `Our model (ExtraTrees, retrained every build) predicts each prospect's NBA minutes per game and VORP per season over his first ${M.years_out} seasons from the board's attributes, his build and his college stats, trained on the ${M.trained_on} drafts (${M.samples} prospects; the oldest from the rerank tab, the newest with partial careers). Leave-one-draft-out it correlates ${M.mpg.corr_model} with real minutes (the board's score alone: ${M.mpg.corr_score_only}) and ${M.vorp_per.corr_model} with VORP (score alone: ${M.vorp_per.corr_score_only}). Past drafts show out-of-fold predictions (made without that draft).` : '';
  view.innerHTML = `<h2>NBA Drafts: Present and Past</h2>
    <p class="lede">Draft boards from the realgm + barttorvik workflow (college stats from RealGM and Barttorvik play-by-play with strength of schedule; international players from RealGM), with skill grades, outcome probabilities, NBA comparisons and machine-learning projections. Each prospect is linked to his NBA career so far. ${modelNote}</p>
    ${draftNav(I, mode === 'one' ? year : mode)}
    <div class="toolbar">
      <input class="draft-filter" id="draft-filter" placeholder="Filter by name, school, position…"> <span class="small muted">${R.length} prospects</span> <label class="small"><input type="checkbox" id="draft-cmp"> Show comparison columns (Rerank model, Hybrid, Value set)</label>${multi ? ' <span id="draft-pager" class="draft-pager"></span>' : ''}</div>
    ${legend}
    ${modelExplainer(M)}
    <h3>${mode === 'all' ? 'All drafts' : mode === 'backtoschool' ? 'Back to school' : mode === 'noncollege' ? 'Non-college prospects, all drafts' : mode === 'other' ? 'Other: early entrants who withdrew' : `${year} board`}</h3>
    ${colHelp}
    ${mode === 'backtoschool' ? '<p class="small">Prospects listed on a board who went back to school instead (Thomas Haugh, Alex Condon, Alijah Arenas, Moustapha Thiam, Braylon Mullins in 2026). They are off that main board and its class ranks; the model\'s projection from that season is kept for reference.</p>' : ''}
    ${mode === 'noncollege' ? '<p class="small">Every main-board prospect without college stats: internationals (RealGM pro stats), G League Ignite, Overtime Elite, prep and others, across all drafts. <b>Class rank</b> is still his rank within his own draft class (past classes out-of-fold); sort by <b>All-class pct</b> to compare across drafts.</p>' : ''}
    ${mode === 'other' ? '<p class="small">Players who declared for that draft and withdrew (the block at the end of each sheet tab, ranked out of order). They keep their stats from that season; <b>Next board</b> is the later draft whose main board he is on. Late additions who were drafted that year stay on the main board.</p>' : ''}
    <p class="small muted"><b>NBA so far</b> reads minutes per game / BPM / total VORP over his NBA seasons since the draft (e.g. 33.5 / +1.4 / 2 = 33.5 min a game, +1.4 box plus-minus, 2.0 VORP in total). <b>Model min/g</b> and <b>Model VORP/yr</b> are our model's predictions for his first ${M ? M.years_out : 4} seasons. Boards are in order of the model's class rank (#1 first). Click any column header to sort; click again to reverse.</p>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="board"><thead><tr>${idHead}<th class="num">Age</th><th class="num">Score</th><th>Pos</th><th>Info</th><th class="num">Pick</th><th class="num" title="NBA career so far (all seasons after the draft): minutes per game / BPM (minutes-weighted) / total VORP">NBA so far<br><span class="small muted">min/g · BPM · VORP</span></th><th class="num" title="Our model: minutes per game over his first seasons">Model min/g</th><th class="num" title="Our model: VORP per season">Model VORP/yr</th><th class="num" data-cmp title="Rerank model: a second model trained on where prospects actually rerank in their class (retrained every build as reranks change); his predicted class rank">Rerank model</th><th class="num" data-cmp title="Hybrid: the average of his VORP-model, rerank-model and Value set class ranks, re-ranked within the class">Hybrid</th><th class="num" title="Actual: where he reranks in his class so far (minutes, BPM and usage since the draft; see Draft reranks), to compare with the pre-draft ranks beside it">Rerank</th><th class="num" title="Predicted VORP percentile over every draft class 2016-2026">All-class pct</th><th title="Our model's PRE-DRAFT projection: tier from his all-class predicted-VORP rank (in brackets: from his class rank, when different)">Model tier (pre-draft)</th><th title="What actually happened: the same tiers applied to his real first four NBA seasons (so far, for newer classes); hover for his career">Actual tier</th><th title="Offense or defense lean of his predicted impact (predicted OBPM vs DBPM)">Lean</th><th class="num" data-cmp title="Value set: the user's scouting principles (shooting touch, skill confluences, two-way play, bigs' range and rim protection, school, team context) as points on the model's VORP per season; rank in class. Hand-set rules, not validated: hover a cell for the rules that fired">Value set</th></tr></thead><tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '')).toLowerCase())}">${idCells(r, i)}<td class="num ${dCls(r.style.age)}">${dnum(r.Age, 1)}</td><td class="num">${dnum(r.Score, 2)}</td><td>${esc(r.Pos || '')}</td>
        <td class="nowrap ${dCls(r.style.info)}">${esc(r.Info || '')}</td><td class="num">${r.pick ? `${r.pick} <span class="muted small">${r.drafted_by}</span>` : '<span class="muted">–</span>'}</td>
        <td class="num small" data-v="${r.nba ? r.nba.mpg : ''}" title="${r.nba ? `${r.nba.mpg} minutes per game, BPM ${sgn(r.nba.bpm, 1)}, ${r.nba.vorp} total VORP over ${r.nba.seasons} season(s), ${r.nba.games} games` : 'No NBA games yet'}">${r.nba ? `${r.nba.mpg} / ${sgn(r.nba.bpm, 1)} / ${r.nba.vorp}` : '<span class="muted">–</span>'}</td>
        <td class="num">${r.pred ? r.pred.mpg : '–'}</td><td class="num">${r.pred ? sgn(r.pred.vorp_per, 2) : '–'}</td>${r.pred && r.pred.tier ? `${r.pred.rr_rank ? `<td class="num" data-v="${r.pred.rr_rank}" title="predicted class rerank percentile ${Math.round(r.pred.rr * 100)}${r.pred.rr_oof ? ' (out-of-fold)' : ''}">${r.pred.rr_rank}<span class="muted small">/${r.pred.rr_of}</span></td>` : '<td></td>'}${r.hybrid ? `<td class="num" data-v="${r.hybrid.class_rank}" title="average of VORP model #${r.pred.class_rank}, rerank model #${r.pred.rr_rank} and Value set #${r.value_set.class_rank}">${r.hybrid.class_rank}<span class="muted small">/${r.hybrid.class_of}</span></td>` : '<td></td>'}${r.rerank ? `<td class="num" data-v="${r.rerank.rerank}" title="reranked #${r.rerank.rerank} of ${r.rerank.of} in his class; ${sgn(r.rerank.score, 1)} vs his draft slot${r.rerank.bust ? ' (bust)' : ''}">${r.rerank.rerank}<span class="muted small">/${r.rerank.of}</span></td>` : '<td></td>'}<td class="num">${r.pred.all_pct}</td><td class="nowrap small">${tierPill(r.pred.tier)}${r.pred.class_tier !== r.pred.tier ? ` <span class="muted">(${esc(r.pred.class_tier)})</span>` : ''}</td>${actualCell(r)}<td class="small">${esc(r.pred.lean)}</td>` : '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>'}${valueCell(r)}</tr>`).join('')}</tbody></table></div>
    <h3>Outcome probabilities</h3>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="out">${head(outcome)}<tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '')).toLowerCase())}">${idCells(r, i)}${outcome.map(k => `<td class="num" style="${scales[k](r[k])}">${r[k] == null ? '–' : (r[k] * 100).toFixed(1) + '%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <h3>Skills</h3>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="skills">${head(skills)}<tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '')).toLowerCase())}">${idCells(r, i)}${skills.map(k => `<td class="num" style="${scales[k](r[k])}">${dnum(r[k], 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <h3>NBA comparisons</h3>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="comps"><thead><tr>${idHead}${[...Array(10)].map((_, k) => `<th>${k + 1}</th>`).join('')}</tr></thead><tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '')).toLowerCase())}">${idCells(r, i)}${r.comps.map(c => `<td class="nowrap small"${compTitle(c)}>${esc(c.name)} <span class="muted">${dnum(c.sim, 2)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${projKeys.length || ratioKeys.length || textKeys.length ? `<h3>Projections, ratios and ratings</h3>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="proj">${head([...projKeys, ...ratioKeys, ...textKeys])}<tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '')).toLowerCase())}">${idCells(r, i)}${projKeys.map(k => `<td class="num">${dnum(r[k], 2)}</td>`).join('')}${ratioKeys.map(k => `<td class="num ${r.style.ratios && r.style.ratios[k] ? 'd-fill-' + r.style.ratios[k] : ''}">${dnum(r[k], 3)}</td>`).join('')}${textKeys.map(k => `<td class="nowrap small">${esc(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
    ${R.some(r => r.tags.length) ? `<h3>Archetype tags</h3>
    <div class="table-wrap draft-wrap"><table class="draft-table" data-t="tags"><thead><tr>${idHead}<th>Tags</th></tr></thead><tbody>
      ${R.map((r, i) => `<tr data-q="${esc((r.name + ' ' + (r.Info || '') + ' ' + (r.Pos || '') + ' ' + r.tags.join(' ')).toLowerCase())}">${idCells(r, i)}<td>${tagPills(r.tag_pos, 'good')}${(r.tag_pos || []).length && (r.tag_neg || []).length ? ', ' : ''}${tagPills(r.tag_neg, 'bad')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  sortableTables(view, '.draft-table');
  // the comparison columns (rerank model, hybrid, Value set) are hidden unless asked for: Class rank leads
  const board = view.querySelector('.draft-table[data-t="board"]'), cmpBox = view.querySelector('#draft-cmp');
  if (board) {
    const idx = [...board.tHead.rows[0].cells].map((c, i) => c.hasAttribute('data-cmp') ? i : -1).filter(i => i >= 0);
    board.querySelectorAll('tr').forEach(tr => idx.forEach(i => tr.cells[i] && tr.cells[i].classList.add('cmp')));
    let show = false;
    try { show = localStorage.getItem('draftCmp') === '1'; } catch (e) {}
    const set = v => { board.classList.toggle('hide-cmp', !v); cmpBox.checked = v; try { localStorage.setItem('draftCmp', v ? '1' : '0'); } catch (e) {} };
    set(show);
    cmpBox.addEventListener('change', () => set(cmpBox.checked));
  } else if (cmpBox) cmpBox.parentElement.remove();
  // All drafts / Other: DRAFT_PAGE rows at a time (each table, in its current sort order), filter first
  let page = 0, q = '';
  const pager = view.querySelector('#draft-pager');
  const apply = () => {
    let total = 0;
    view.querySelectorAll('.draft-table tbody').forEach(tb => {
      const hit = [...tb.rows].filter(tr => !q || (tr.dataset.q || '').includes(q));
      total = Math.max(total, hit.length);
      [...tb.rows].forEach(tr => { tr.hidden = true; });
      (multi ? hit.slice(page * DRAFT_PAGE, (page + 1) * DRAFT_PAGE) : hit).forEach(tr => { tr.hidden = false; });
    });
    if (!pager) return;
    const pages = Math.max(1, Math.ceil(total / DRAFT_PAGE));
    page = Math.min(page, pages - 1);
    pager.innerHTML = total ? `<button class="pg" data-d="-1"${page ? '' : ' disabled'}>‹ Prev</button> <span class="small muted">rows ${page * DRAFT_PAGE + 1}–${Math.min(total, (page + 1) * DRAFT_PAGE)} of ${total}</span> <button class="pg" data-d="1"${page < pages - 1 ? '' : ' disabled'}>Next ›</button>` : '<span class="small muted">no matches</span>';
  };
  if (pager) pager.addEventListener('click', e => {
    const b = e.target.closest('.pg');
    if (b && !b.disabled) { page += +b.dataset.d; apply(); }
  });
  view.querySelectorAll('.draft-table thead th').forEach(th => th.addEventListener('click', () => { page = 0; apply(); }));
  view.querySelector('#draft-filter').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); page = 0; apply(); });
  apply();
}
const DRAFT_PAGE = 20;
// the Drafts tab's view switcher: a highlighted bar of every view (boards by year, all drafts, non-college,
// withdrawn, school ratings, reranks), shown at the top of each draft page
const DRAFT_VIEWS = [['all', 'All drafts'], ['noncollege', 'Non-college (international, pro, prep)'], ['other', 'Other (withdrew)'], ['backtoschool', 'Back to school'],
  ['schools', 'School ratings'], ['reranks', 'Draft reranks']];
function draftNav(I, cur) {
  const pill = (v, label) => `<a class="dn-pill${String(cur) === String(v) ? ' active' : ''}" href="#drafts/${v}"${String(cur) === String(v) ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  return `<nav class="draft-nav" aria-label="Draft views">
    <div class="dn-row"><span class="dn-k">View</span>${DRAFT_VIEWS.map(([v, l]) => pill(v, l)).join('')}</div>
    <div class="dn-row"><span class="dn-k">Draft</span>${[...I.years].sort((a, b) => b - a).map(y => pill(y, y)).join('')}</div></nav>`;
}
function draftViewSelect(I, cur) { return draftNav(I, cur); }
function bindDraftView(view) {
  view.querySelector('#draft-year')?.addEventListener('change', e => { location.hash = `#drafts/${e.target.value}`; });
}
async function renderSchools(view, I, sub) {
  if (sub) return renderSchool(view, I, decodeURIComponent(sub));
  const S = await getJSON('data/drafts/schools.json');
  const pl = (p, y) => `${esc(p.name)} <span class="muted">${y} · ${sgn(p.score, 1)}</span>`;
  view.innerHTML = `<h2>NBA Drafts: school ratings</h2>
    <p class="lede">How reliably each school's prospects (${S.classes} classes) beat or missed their draft slot. Every class is re-ranked by NBA value since the draft (minutes, impact and usage; <a href="#drafts/reranks">Draft reranks</a>), and each player scores 10 × (ln pick − ln rerank), as in the GM draft score: positive = he outplayed his slot. Undrafted players count as pick 61, a draftee who never played reranks last, and a lottery pick who became a top-10 player of his class gets a bonus (so a #1 pick who became the best player isn't a zero). The school score is the sum over its players; it moves as careers develop. <b>Hits</b> beat their slot; <b>busts</b> are 1st-round picks who reranked ${-S.bust_score}+ points below it or never played; <b>reliability</b> = hits ÷ (hits + busts). <b>Rating</b>: the score per player, shrunk toward 0 for schools with few players: very good (2+), good (0+), bad (below 0). International and G League / Overtime Elite players are grouped as their own rows.</p>
    <div class="toolbar">${draftViewSelect(I, 'schools')} <input class="draft-filter" id="draft-filter" placeholder="Filter schools…"> <span class="small muted">${S.schools.length} schools · click a header to sort</span></div>
    <div class="table-wrap draft-wrap"><table class="draft-table"><thead><tr><th>#</th><th>School</th><th class="num" title="Prospects on the boards (or drafted)">Prospects</th><th class="num" title="Played in the NBA">Reached NBA</th><th class="num">Drafted</th><th class="num" title="Sum of over/under-achievement vs draft slot">School score</th><th class="num" title="Per prospect">Avg</th><th class="num">Hits</th><th class="num">Busts</th><th class="num">Reliability</th><th class="num" title="Over/under vs draft slot per prospect (shrunk toward 0 for small samples)">Beats slot</th><th class="num" title="VORP per prospect (shrunk toward 0 for small samples)">Value / prospect</th><th title="Half beats-its-draft-slots, half value produced (each standardized over all schools): very good 1+ SD, good 0+, bad below 0">Rating</th><th title="Program size by prospects since 2016: small 3 or fewer, medium 4-9, large 10+">Size</th><th class="num" title="Total VORP since their drafts">VORP</th><th>Best</th><th>Worst</th></tr></thead><tbody>
      ${S.schools.map(x => `<tr data-q="${esc(x.school.toLowerCase())}"><td class="rank">${x.rank}</td><td class="name-cell"><a href="#drafts/schools/${encodeURIComponent(x.school)}">${esc(x.school)}</a></td><td class="num">${x.prospects}</td><td class="num">${x.nba}</td><td class="num">${x.drafted}</td><td class="num ${x.score > 0 ? 'd-col-green' : x.score < 0 ? 'd-col-red' : ''}">${sgn(x.score, 1)}</td><td class="num">${sgn(x.avg, 1)}</td><td class="num">${x.hits}</td><td class="num">${x.busts}</td><td class="num">${x.reliability == null ? '–' : Math.round(x.reliability * 100) + '%'}</td><td class="num">${sgn(x.shrunk, 2)}</td><td class="num">${dnum(x.value_per, 2)}</td><td data-v="${x.rating}">${schoolPill({ ...x, of: S.schools.length, size: null })}</td><td data-v="${x.prospects}">${esc(x.size || '')}</td><td class="num">${dnum(x.vorp, 1)}</td><td class="small nowrap">${pl(x.best, x.best.year)}</td><td class="small nowrap">${pl(x.worst, x.worst.year)}</td></tr>`).join('')}</tbody></table></div>`;
  sortableTables(view, '.draft-table');
  bindDraftView(view);
  view.querySelector('#draft-filter').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    view.querySelectorAll('tr[data-q]').forEach(tr => { tr.hidden = q && !tr.dataset.q.includes(q); });
  });
}
async function renderSchool(view, I, name) {
  const S = await getJSON('data/drafts/schools.json');
  const x = S.schools.find(s => s.school === name);
  if (!x) { view.innerHTML = `<p>No school named ${esc(name)}. <a href="#drafts/schools">All schools</a></p>`; return; }
  const who = p => p.board_i != null ? `<a href="#prospect/${p.year}/${p.board_i}">${esc(p.name)}</a>` : p.pid ? `<a href="#splayer/${esc(p.pid)}">${esc(p.name)}</a>` : esc(p.name);
  // outcome colors: stars by class rerank, risers / underachievers by rerank vs draft slot (10 x (ln pick - ln rerank))
  const outcome = p => !p.games ? (p.pick ? ['bust', 'Never played'] : null)
    : p.rerank <= 2 ? ['super', 'Superstar of the class (rerank 1-2)'] : p.rerank <= 6 ? ['star', 'Star (rerank 3-6)']
    : p.bust ? ['bust', 'Bust'] : p.score >= 8 ? ['riser', 'Rose well above his draft slot'] : p.score <= -8 ? ['under', 'Underachieved his draft slot'] : null;
  view.innerHTML = `<p><a href="#drafts/schools">← School ratings</a></p>
    <h2>${esc(x.school)} ${schoolPill({ ...x, of: S.schools.length })}</h2>
    <p class="small">#${x.rank} of ${S.schools.length} · ${x.prospects} prospects (${esc(x.size)} program), ${x.nba} reached the NBA, ${x.drafted} drafted · school score ${sgn(x.score, 1)} (${sgn(x.avg, 1)} a player) · ${x.hits} hits, ${x.busts} busts · ${dnum(x.vorp, 1)} VORP since their drafts</p>
    <p class="small muted">Each player's class rerank (minutes, BPM and usage since the draft) against his draft slot; over/under = 10 × (ln pick − ln rerank), undrafted = 61.</p>
    <p class="small so-legend"><span class="so-super">Superstar (class rerank 1–2)</span> <span class="so-star">Star (rerank 3–6)</span> <span class="so-riser">Rose well above his slot (over/under +8)</span> <span class="so-under">Underachieved his slot (−8)</span> <span class="so-bust">Bust / drafted, never played</span> · click a name for his prospect page</p>
    <div class="table-wrap draft-wrap"><table class="draft-table"><thead><tr><th class="num">Draft</th><th>Player</th><th class="num">Pick</th><th class="num">Rerank</th><th class="num">Over/under</th><th class="num">Games</th><th class="num">VORP</th></tr></thead><tbody>
      ${x.players.map(p => { const o = outcome(p); return `<tr${o ? ` class="so-${o[0]}" title="${o[1]}"` : ''}><td class="num"><a href="#drafts/reranks/${p.year}">${p.year}</a></td><td class="name-cell">${who(p)}${p.bust ? ' <span class="d-tag bad">bust</span>' : ''}</td><td class="num">${p.pick || 'UD'}</td><td class="num" data-v="${p.rerank}">${p.games ? p.rerank : '–'}<span class="muted small">/${p.of}</span></td><td class="num ${p.score > 0 ? 'd-col-green' : p.score < 0 ? 'd-col-red' : ''}">${sgn(p.score, 1)}</td><td class="num">${p.games || 0}</td><td class="num">${dnum(p.vorp, 1)}</td></tr>`; }).join('')}</tbody></table></div>`;
  sortableTables(view, '.draft-table');
}

async function renderReranks(view, I, sub) {
  const R = await getJSON('data/drafts/reranks.json');
  const y = String(Number(sub) || R.years[0]);
  const P = R.classes[y] || [];
  view.innerHTML = `<h2>NBA Drafts: ${y} rerank</h2>
    <p class="lede">The ${y} class re-ranked by NBA value since the draft: minutes × (his box plus-minus, shrunk toward replacement level when he has few minutes, + 2), plus credit for the minutes themselves and for usage above 18% (the responsibility a team gave him). The weights were fitted to the user's own hand-made reranks (rank correlation 0.92 with them; career VORP alone 0.72), so a good rate in a small role no longer outranks a big role. EPM only exists for recent seasons, so BPM carries it. Over/under = 10 × (ln pick − ln rerank), plus a bonus for lottery picks who became top-10 players of the class; undrafted = pick 61. This feeds the <a href="#drafts/schools">school ratings</a> and updates as careers develop.</p>
    <div class="toolbar">${draftViewSelect(I, 'reranks')} <label class="small">Class <select id="rr-year">${R.years.map(z => `<option${String(z) === y ? ' selected' : ''}>${z}</option>`).join('')}</select></label> <span class="small muted">${P.length} players · click a header to sort</span></div>
    <div class="table-wrap draft-wrap"><table class="draft-table"><thead><tr><th class="num">Rerank</th><th>Player</th><th class="num">Pick</th><th class="num" title="10 x (ln pick - ln rerank)">Over/under</th><th>School</th><th class="num">Seasons</th><th class="num">Games</th><th class="num">Min/g</th><th class="num">BPM</th><th class="num">Usage</th><th class="num">VORP</th><th class="num" title="Minutes x (BPM shrunk toward replacement for small samples + 2), + minutes, + usage above 18%; per 1,000 minutes">Value</th><th class="num" title="Where our board had him">Board #</th></tr></thead><tbody>
      ${P.map(p => `<tr><td class="rank">${p.rerank}</td><td class="name-cell">${p.board_i != null ? `<a href="#prospect/${y}/${p.board_i}">${esc(p.name)}</a>` : esc(p.name)}${p.bust ? ' <span class="d-tag bad">bust</span>' : ''}</td><td class="num">${p.pick ? `${p.pick} <span class="muted small">${p.team}</span>` : '<span class="muted">undrafted</span>'}</td><td class="num ${p.score > 0 ? 'd-col-green' : p.score < 0 ? 'd-col-red' : ''}">${sgn(p.score, 1)}</td><td class="small">${esc(p.school || '')}</td><td class="num">${p.seasons}</td><td class="num">${p.games}</td><td class="num">${p.games ? dnum(p.mp / p.games, 1) : '–'}</td><td class="num">${p.bpm == null ? '–' : sgn(p.bpm, 1)}</td><td class="num">${p.usg == null ? '–' : dnum(p.usg, 1)}</td><td class="num">${dnum(p.vorp, 1)}</td><td class="num">${dnum(p.value, 1)}</td><td class="num">${p.board_rank ?? '–'}</td></tr>`).join('')}</tbody></table></div>`;
  sortableTables(view, '.draft-table');
  bindDraftView(view);
  view.querySelector('#rr-year').addEventListener('change', e => { location.hash = `#drafts/reranks/${e.target.value}`; });
}
function sortableTables(root, sel) {
  const key = td => {
    if (!td) return null;
    const v = td.dataset.v ?? td.textContent.trim();
    if (v === '' || v === '–') return null;
    const n = parseFloat(String(v).replace(/^[#+]/, '').replace('%', ''));
    return isNaN(n) || !/^[#+\-−]?\d/.test(String(v)) ? String(v).toLowerCase() : n;
  };
  root.querySelectorAll(sel).forEach(t => t.querySelectorAll('thead th').forEach((th, c) => {
    th.classList.add('sortable');
    th.addEventListener('click', () => {
      const dir = th.dataset.dir === 'desc' ? 'asc' : 'desc';
      t.querySelectorAll('thead th').forEach(h => { delete h.dataset.dir; h.classList.remove('sorted'); });
      th.dataset.dir = dir; th.classList.add('sorted');
      const body = t.tBodies[0];
      const rows = [...body.rows].map(r => [key(r.cells[c]), r]);
      rows.sort(([a], [b]) => a == null ? 1 : b == null ? -1 :
        (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1) * (dir === 'desc' ? -1 : 1));
      rows.forEach(([, r]) => body.appendChild(r));
    });
  }));
}
const TIER_CLS = { 'Superstar': 'good', 'Star': 'good', 'Starter': 'good', 'Super role player': '', 'Role player': '', 'Benchwarmer': 'bad', "Won't get the chance": 'bad' };
function collegeBlock(c) {
  const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
  return `<p class="small"><b>College (${esc(c.team)}, ${c.season - 1}-${String(c.season).slice(2)}, Barttorvik):</b> ${c.gp ?? '–'} of ${c.team_games ?? '–'} games${c.games_missed ? ` · <span class="${c.games_missed >= 15 ? 'd-col-red' : ''}">${c.games_missed} games missed over ${c.seasons} college season${c.seasons > 1 ? 's' : ''}</span>` : ''} · ${dnum(c.mpg, 1)} min · ${dnum(c.pts, 1)} pts · BPM ${sgn(c.bpm, 1)} (O ${sgn(c.obpm, 1)} / D ${sgn(c.dbpm, 1)}) · ${dnum(c.dunks_pg, 1)} dunks a game (${pct(c.dunk_rate)} of shots) · ${pct(c.rim_rate)} of shots at the rim · ${pct(c.astd_rate)} of makes assisted · steal ${dnum(c.stl, 1)}% · block ${dnum(c.blk, 1)}%${c.rec_rank ? ` · recruit rating ${dnum(c.rec_rank, 1)}` : ''}${c.sos != null ? ` · SOS ${dnum(c.sos, 3)}` : ''}</p>`;
}
function compTitle(c) { return /^\{\[.*\]\}$/.test((c.name || '').trim()) ? ' title="Height and weight match"' : ''; }
// where a non-college prospect played before the draft
function background(r) {
  const info = r.Info || '';
  if (/ignite|g-league/i.test(info)) return 'G League Ignite';
  if (/overtime|\bote\b/i.test(info)) return 'Overtime Elite';
  if (r.intl || r.pro) return r.pro && r.pro.team && r.pro.team !== 'All' ? `International (${r.pro.team})` : 'International';
  if (/prep|academy|high school|nike|eybl/i.test(info + ' ' + r.name)) return 'Prep';
  return r.school ? `${r.school} (no college stats matched)` : 'Prep / other';
}

function valueCell(r) {
  const v = r.value_set;
  if (!v || !v.class_rank) return '<td></td>';
  const why = v.rules.map(([l, p]) => `${p > 0 ? '+' : ''}${p} ${l}`).join('\n');
  return `<td class="num" data-v="${v.class_rank}" title="${esc(`${sgn(v.vorp, 2)} VORP/yr${why ? '\n' + why : ''}`)}">${v.class_rank}<span class="muted small">/${v.class_of}</span></td>`;
}

function actualCell(r) {
  const a = r.actual;
  if (!a) return '<td class="small muted">–</td>';
  return `<td class="nowrap small" title="First ${a.seasons} season${a.seasons > 1 ? 's' : ''}${a.complete ? '' : ' (so far)'}; career since the draft (${a.career_seasons} seasons): ${a.career_tier}, ${sgn(a.career_vorp_per, 2)} VORP a season">${tierPill(a.tier)}${a.complete ? '' : ' <span class="muted">so far</span>'}${a.career_tier !== a.tier && a.complete ? ` <span class="muted">→ ${esc(a.career_tier)}</span>` : ''}</td>`;
}
function schoolPill(t) {
  const cls = t.tier === 'very good' ? 'good' : t.tier === 'bad' ? 'bad' : '';
  return `<a href="#drafts/schools/${encodeURIComponent(t.school)}" class="d-tag ${cls}" title="School rating: #${t.rank} of ${t.of} by how its players beat their draft slots and the value (VORP) they produced${t.size ? `; ${t.size} program (${t.prospects} prospects since 2016)` : ''}">${esc(t.tier)}${t.size ? ` · ${esc(t.size)}` : ''} school</a>`;
}
function tierPill(t) { return `<span class="d-tag ${TIER_CLS[t] || ''}">${esc(t)}</span>`; }
function modelExplainer(M) {
  if (!M) return '';
  const tiers = (M.tiers || []).map(t => `<li><b>${esc(t.tier)}</b> · ${(t.share * 100).toFixed(1)}% of past prospects</li>`).join('');
  return `<details class="card d-legend" style="padding:10px 14px;margin-bottom:14px"><summary class="strong">How our model works (training, inputs, VORP, tiers)</summary>
    <p><b>What it predicts.</b> For each prospect, his NBA minutes per game and VORP per season over his first ${M.years_out} seasons after the draft (0 minutes if he never played), plus his OBPM and DBPM (the offense / defense lean). VORP is Basketball-Reference's value over a replacement-level player, built from box plus-minus and minutes, so a player has to both play and produce to score well.</p>
    <p><b>How it was trained.</b> ExtraTrees (an ensemble of randomized decision trees, as in the realgm/barttorvik scripts) fit on the ${M.trained_on} drafts (${M.samples} prospects; withdrawn early entrants are left out so nobody counts twice). ${M.history_samples ? `${M.history_samples} of them are the 2008-2015 classes from the user's rerank tab (skill grades and Barttorvik stats, no board score), at half weight and never held out or scored; they lifted the top-15 picks' VORP r from 0.43 to 0.45. ` : ''}A prospect's college BPM is also compared with earlier prospects from the same school, so a standout on a roster that holds everyone's numbers down (Kentucky) gets credit. It also weighs shot profile (mid-range-heavy scorers, foul drawing, FT% with three-point volume) and, for bigs, range, vertical pop, handles and passing: among top-15 picks, bigs with none of range, pop or handles fell short of their predictions. The board's Bust probability is left out (accuracy rose without it).${M.tall_playmaker ? `<b>Tall playmakers</b> (guard-or-bigger height with top-quarter handles and vision, range and some steals) get a calibration bonus of ${sgn(M.tall_playmaker.bonus, 2)} VORP a season, learned from how far the model under-predicted the ${M.tall_playmaker.n} earlier ones. ` : ''}${M.low_volume ? `Highly rated prospects (board score 1+) who scored under 10 points a game in college get ${sgn(M.low_volume.bonus, 2)}, learned the same way from ${M.low_volume.n} earlier ones (the model over-predicted all of them). These calibrations came from mining the user's archetype conditions in predictDomWModel / predictIntWModel / FinalConditioning for consistent model misses; applying every consistent one lowered accuracy, these two raise it. ` : ''}<b>Value set</b> (last board column) is a separate scouting view: the user's principles from their predict scripts and macros (shooting touch, self-creation: unassisted makes + foul drawing + handles, productive freshmen, volume shooters who draw fouls, point forwards, big scoring wings, handles + vision + jumper, vision + steals, blocks + steals, two-way efficiency, wings who can't shoot, highly rated prospects with negative offensive efficiency, high usage on a weak college team, bigs without range / pop / handles or rim protection, paint-bound bigs without hops, blocks or passing, youth, school rating) added as points to the model's VORP per season. Fitted to the user's own reranks these rules agreed with them less than the model alone (0.32 vs 0.34), so they are shown beside the model, not mixed into it. <b>Rerank model</b> is a second model trained on where prospects actually rerank in their class (minutes, BPM and usage since the draft), retrained every build as careers develop; held out by draft it matches the real class reranks better than the VORP model (rank correlation 0.54 vs 0.46 among NBA players, 0.58 vs 0.46 over the whole board). <b>Hybrid</b> averages the VORP model's, the rerank model's and the Value set's class ranks and re-ranks the class (held out 0.51 vs the real reranks); <b>Rerank</b> beside it is where he actually reranks so far. ${M.scout ? ` <b>Scout adjustments</b> (rules, not learned) then multiply predicted VORP: ×${M.scout.no_stats} for prospects with no college or pro stats (Overtime Elite, G League Ignite, prep) and ×${M.scout.unicorn} for unicorn bigs (6-11+, shot-blocking with range, a top board score), plus point docks and bonuses from your conditions (athletic wing creators like Edwards +0.4; paint-bound bigs like Carey, undersized bigs with no three like Okongwu, unathletic soft perimeter players like Ayayi −0.1; high-usage foul-prone scorers without hops or vision like Mason Jones and Elleby −0.15; small light guards 6'4" and 180 lb or under without top vertical, steals or downhill burst like Philon, Christian Anderson, Kira Lewis Jr. and Hands −0.2, very light guards −0.1; bigs who barely played in college like Wiseman −0.25; perimeter players with poor free-throw touch like Fultz and Lonzo −0.2; mid-range-heavy perimeter players −0.15; high-usage guards on weak teams at bad schools like Dennis Smith Jr. −0.25; big scoring wings like Tatum +0.2; self-creators with touch +0.1), ${M.scout.n} prospects in all. They are judgment calls, not learned: VORP r on the complete drafts is ${M.scout.corr_with} with them, ${M.scout.corr_without ?? M.scout.corr_with} without (the productive-shooter bonus for college BPM 7.5+ with FT 78%+ and three-point volume (Mitchell, Markkanen) is the big gain; elite-vertical rim protectors, elite-gravity wings, Overtime Elite and injury-shortened seasons are smaller rules). On top of those, ${M.scout.user_rules || 0} of your conditionals (stat and body combinations in the style of predictDomWModel.py, applied to every prospect who fits, past and future: small guards without hops, older one-dimensional shooters, unathletic bigs, weak programs, young international size, tall skilled wings, productive athletic bigs, …) are applied as judgment calls; with them VORP r is ${M.scout.corr_all ?? '–'}. Each prospect's page lists every rule and conditional that fired.` : ''} Classes that have played fewer than ${M.years_out} NBA seasons (2023-2025) are included with what they have so far: they count less (1-3 seasons of ${M.years_out}), and how many seasons were seen is an input that is set to ${M.years_out} when predicting. Accuracy below is measured only on the complete ${M.complete_on || M.trained_on} drafts (${M.complete_samples || M.samples} prospects). Every class through ${(M.trained_on || '').slice(-4)} shows out-of-fold predictions; the newest class has no NBA seasons yet and is predicted by the model fit on all of them. It retrains on every build, so as careers develop it learns from them.</p>
    <p><b>Inputs (value set).</b> The board's own numbers (score, age, projected pick, the seven outcome probabilities, offensive / defensive efficiency, the twelve skill grades), position, height, weight, international, build relative to position (pounds per inch and height vs other guards / wings / bigs, so a skinny big reads as one), raw college stats where the training workbook has them (strength of schedule, dunk %, at-rim rate, assisted rate, jumper volume, 3-point tendency and the per-game lines), <b>Barttorvik's season stats for every college prospect</b> (games played and games missed over his college career as an injury / availability signal, minutes, offensive and defensive ratings, BPM split, dunks and dunk rate, at-rim and mid-range rates, share of makes assisted, recruiting rating, class, strength of schedule, team strength, change from last season), his <b>school's track record</b> from earlier classes (how many prospects it produced, how many reached the NBA or the lottery, their VORP) and coach-era / conference flags (Calipari at Kentucky through 2024 and Arkansas from 2025, power conference). Most important: ${(M.top_features || []).map(([k, v]) => `${esc(k)} ${(v * 100).toFixed(0)}%`).join(', ')}.</p>
    <p><b>How well it does.</b> Tested leave-one-draft-out (each draft predicted by a model that never saw it): correlation with real minutes ${M.mpg.corr_model} (the board's score alone ${M.mpg.corr_score_only}), with real VORP ${M.vorp_per.corr_model} (score alone ${M.vorp_per.corr_score_only}); typical miss ${M.mpg.mae_model} min/g. The Barttorvik stats lifted it the most; school track record and coach flags are about neutral, since the board score, projected pick and recruiting rating already carry most of a school's pedigree. For highly rated prospects it also weighs the board score against the school's track record, free-throw %, rim rate and college defensive BPM (what separated the top-15 picks who beat their slot, like SGA and Tatum, from busts like Ayton and Ball). The classes with partial careers (2023-25) are included, weighted by seasons seen. Tested and left out because they did not help: a target over the whole career (no better on careers), the user's hand-made rerank strata as a target (no better), separate international and college models (worse on minutes), the prediction script's fudge-factor rules, position-normalized skills, athleticism interactions, and a neural network (which did much worse with this little data).</p>
    <p><b>Predicted vs actual.</b> Model tiers are pre-draft projections (past classes: made without that class). Next to them, <b>Actual tier</b> applies the same tiers to his real first four seasons (→ his whole career since), and prospect pages add his rerank vs his draft slot (bust flag), his latest season, and an <b>availability risk</b>: the games his closest past prospects (by the model) missed in their rotation seasons, next to his own college games missed. <b>Closest past prospects</b> are the model's own comparisons: the share of its trees that put two prospects in the same leaf.</p><p><b>Tiers.</b> Real outcomes over the first ${M.years_out} seasons define the tiers (Superstar VORP 2.0+ a season, Star 1.2+, Starter 0.6+, Super role player 0.25+, Role player 12+ min/g, Benchwarmer played, Won't get the chance never played). Predictions are shrunk toward the middle, so a prospect's tier comes from his predicted-VORP rank: the top ${(((M.tiers || [])[0] || {share: 0}).share * 100).toFixed(1)}% of all classes are Superstars, and so on down with the same shares as real careers. The class tier does the same within his own draft class.</p><ul>${tiers}</ul></details>`;
}
function tagPills(tags, cls) { return (tags || []).map(t => `<span class="d-tag ${cls}">${esc(t)}</span>`).join(', '); }
function skillRow(r, D, I) {
  const keys = ['OffEff', 'DefEff', ...I.skills, 'HgtC', 'Uniq'].filter(k => D.rows.some(q => q[k] != null));
  return `<h3>Skills</h3><div class="table-wrap"><table class="draft-table"><thead><tr>${keys.map(k => `<th class="num">${esc(k)}</th>`).join('')}</tr></thead><tbody>
    <tr>${keys.map(k => `<td class="num" style="${colScale(D.rows, k)(r[k])}">${dnum(r[k], 2)}</td>`).join('')}</tr>
    ${r.pct ? `<tr class="small muted">${keys.map(k => `<td class="num">${r.pct[k] != null ? ordinal(Math.round(r.pct[k] * 100)) : ''}</td>`).join('')}</tr>` : ''}</tbody></table></div>
    <p class="small muted">Colored red → white → green within his ${D.year} class, as on the board; second row = his percentile in the class.</p>`;
}
function draftProfileBlock(r, year, I, D) {
  if (!r) return '';
  const st = r.style || {};
  return `<h3>Draft profile (${year} board)</h3>
    ${r.other ? `<p class="small"><b>Declared for the ${year} draft and withdrew</b>${r.next_board ? ` · on the <a href="#drafts/${r.next_board}">${r.next_board} board</a>` : ''}. <a href="#drafts/other">Other section →</a></p>` : ''}
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Class rank</div><div class="v ${dCls(st.rank)}">${r.pred && r.pred.class_rank ? `#${r.pred.class_rank}<span class="muted small"> of ${r.pred.class_of}</span>` : '–'}</div><div class="small muted">our model's rank in the ${year} class · sheet board #${r.rank ?? '–'}, score ${dnum(r.Score, 2)}${r.pick ? `<br>drafted #${r.pick} by ${r.drafted_by}` : year < new Date().getFullYear() || new Date().getMonth() > 5 ? '<br>undrafted' : ''}</div></div>
      ${r.rerank ? `<div class="tile"><div class="k">Rerank</div><div class="v">#${r.rerank.rerank}<span class="muted small"> of ${r.rerank.of}</span></div><div class="small muted">where he ranks in the ${year} class so far (<a href="#drafts/reranks/${year}">rerank</a>)${r.rerank.bust ? ' <span class="d-tag bad">bust</span>' : ''}${r.pred && r.pred.class_rank ? `<br>${r.rerank.rerank < r.pred.class_rank ? `${r.pred.class_rank - r.rerank.rerank} spot${r.pred.class_rank - r.rerank.rerank === 1 ? '' : 's'} better than our class rank` : r.rerank.rerank > r.pred.class_rank ? `${r.rerank.rerank - r.pred.class_rank} spot${r.rerank.rerank - r.pred.class_rank === 1 ? '' : 's'} worse than our class rank` : 'same as our class rank'}` : ''}</div></div>` : ''}
      <div class="tile"><div class="k">Background</div><div class="small"><span class="${dCls(st.info)}">${esc(r.school || '–')}</span>${r.school_tier ? ` ${schoolPill(r.school_tier)}` : ''}${r.intl ? ' <span class="pill OK">INTERNATIONAL</span>' : ''}<br>${htFmt(r.height_in)}, ${r.weight ?? '–'} lb · ${esc(r.Pos || '')} · age ${dnum(r.Age, 1)} at the draft${r['Birth City'] ? `<br>born ${esc(r['Birth City'])}` : ''}</div></div>
      <div class="tile"><div class="k">Prospect strengths</div><div class="small">${(r.strengths || []).length ? r.strengths.map(esc).join(', ') : '<span class="muted">none in his class\'s top quarter</span>'}</div></div>
      <div class="tile"><div class="k">Prospect weaknesses</div><div class="small">${(r.weaknesses || []).length ? r.weaknesses.map(esc).join(', ') : '<span class="muted">none in his class\'s bottom quarter</span>'}</div></div>
      ${r.pred ? `<div class="tile"><div class="k">Our model</div><div class="v">${r.pred.mpg} min/g</div><div class="small muted">VORP ${sgn(r.pred.vorp_per, 2)} per season, first ${I && I.model ? I.model.years_out : 4} seasons${r.pred.oof ? ' (out-of-fold)' : ''}${r.pred.rr_rank ? `<br>rerank model: #${r.pred.rr_rank} of ${r.pred.rr_of} in his class` : ''}${r.pred.tall_playmaker ? `<br>includes ${sgn(r.pred.tall_playmaker, 2)} tall-playmaker calibration` : ''}${r.pred.low_volume ? `<br>includes ${sgn(r.pred.low_volume, 2)} low-volume-scorer calibration (under 10 pts in college)` : ''}${r.pred.scout ? `<br>scout-adjusted from ${sgn(r.pred.model_vorp_per, 2)}: ${esc(r.pred.scout.join(', '))}` : ''}</div></div>` : ''}
      ${r.pred && r.pred.tier ? `<div class="tile"><div class="k">Model tier (pre-draft)</div><div class="v">${tierPill(r.pred.tier)}</div><div class="small muted">VORP rank #${r.pred.class_rank} of ${r.pred.class_of} in the ${year} class (${esc(r.pred.class_tier)} by class rank) · #${r.pred.all_rank} of ${r.pred.all_of} over all classes (${r.pred.all_pct} percentile)</div></div>
      ${r.actual ? `<div class="tile"><div class="k">How it went</div><div class="v">${tierPill(r.actual.tier)}</div><div class="small muted">first ${r.actual.seasons} NBA season${r.actual.seasons > 1 ? 's' : ''}${r.actual.complete ? '' : ' (so far)'} · career (${r.actual.career_seasons} seasons): ${esc(r.actual.career_tier)}, ${sgn(r.actual.career_vorp_per, 2)} VORP a season${r.rerank ? `<br>vs his draft slot: reranked #${r.rerank.rerank} of ${r.rerank.of} in his class, ${sgn(r.rerank.score, 1)}${r.rerank.bust ? ' <span class="d-tag bad">bust</span>' : ''} (<a href="#drafts/reranks/${year}">rerank</a>)` : ''}${r.latest ? `<br>latest (${r.latest.season - 1}-${String(r.latest.season).slice(2)}): ${r.latest.g ? `${r.latest.g} games, ${r.latest.mpg} min, BPM ${sgn(r.latest.bpm, 1)}, VORP ${dnum(r.latest.vorp, 1)}` : 'did not play'}` : ''}${r.nba_missed != null ? `<br>missed ${Math.round(r.nba_missed * 100)}% of games in his rotation seasons (15+ min)` : ''}</div></div>` : ''}
      ${r.injury_risk ? `<div class="tile"><div class="k">Availability risk</div><div class="v ${r.injury_risk.comp_missed > r.injury_risk.league * 1.25 ? 'd-col-red' : r.injury_risk.comp_missed < r.injury_risk.league * 0.8 ? 'd-col-green' : ''}">${Math.round(r.injury_risk.comp_missed * 100)}% games missed</div><div class="small muted">in rotation seasons by his ${r.injury_risk.n} closest past prospects who became rotation players (all drafted rotation players: ${Math.round(r.injury_risk.league * 100)}%); most: ${r.injury_risk.most.map(m => `${esc(m.name)} ${Math.round(m.missed * 100)}%`).join(', ')}${r.injury_risk.college_missed != null ? ` · he missed ${r.injury_risk.college_missed} college games over ${r.injury_risk.college_seasons} season${r.injury_risk.college_seasons > 1 ? 's' : ''}` : ''}</div></div>` : ''}
      ${r.value_set && r.value_set.class_rank ? `<div class="tile"><div class="k">Value set (scouting view)</div><div class="v">#${r.value_set.class_rank} of ${r.value_set.class_of}${r.hybrid ? ` <span class="small muted">· hybrid #${r.hybrid.class_rank}</span>` : ''}</div><div class="small muted">VORP ${sgn(r.value_set.vorp, 2)} per season after your rules${r.value_set.rules.length ? ': ' + r.value_set.rules.map(([l, p]) => `${esc(l)} (${p > 0 ? '+' : ''}${p})`).join(', ') : ' (none fired)'}</div></div>` : ''}
      <div class="tile"><div class="k">Impact lean</div><div class="v">${esc(r.pred.lean)}</div><div class="small muted">predicted OBPM ${sgn(r.pred.obpm, 1)} · DBPM ${sgn(r.pred.dbpm, 1)} (first ${I && I.model ? I.model.years_out : 4} seasons)</div></div>` : ''}
    </div>
    ${(r.tag_pos || []).length ? `<p><b>Archetype strengths:</b> ${tagPills(r.tag_pos, 'good')}</p>` : ''}
    ${(r.tag_neg || []).length ? `<p><b>Archetype weaknesses:</b> ${tagPills(r.tag_neg, 'bad')}</p>` : ''}
    ${D ? skillRow(r, D, I) : ''}
    ${(r.model_comps || []).length ? `<p class="small"><b>Closest past prospects (our model):</b> ${r.model_comps.map(c => `${c.i != null ? `<a href="#prospect/${c.year}/${c.i}">${esc(c.name)}</a>` : esc(c.name)} <span class="muted">(${c.year}${c.pick ? ` #${c.pick}` : ', undrafted'}, ${Math.round(c.sim * 100)}% similar)</span> ${tierPill(c.tier)}${c.career_tier !== c.tier ? ` <span class="muted">→ ${esc(c.career_tier)}</span>` : ''}`).join(', ')}</p>
    <p class="small muted">The past prospects our model treats as most alike: the share of its decision trees that put the two in the same leaf, i.e. alike on the inputs that matter for NBA value (board grades, size, college stats, school). Earlier drafts only, with how they actually turned out (first four seasons → career).</p>` : ''}
    ${r.college ? collegeBlock(r.college) : ''}
    ${r.pro ? `<p class="small"><b>Pro / international (${r.pro.team === 'All' ? 'all competitions' : esc(r.pro.team || '')}, ${r.pro.season - 1}-${String(r.pro.season).slice(2)}, RealGM):</b> ${r.pro.GP ?? '–'} games · ${dnum(r.pro.MIN, 1)} min a game · per 40: ${dnum(r.pro.PTS, 1)} pts, ${dnum(r.pro.AST, 1)} ast, ${dnum(r.pro.STL, 1)} stl, ${dnum(r.pro.BLK, 1)} blk · TS ${r.pro['TS%'] != null ? Math.round(r.pro['TS%'] * 100) + '%' : '–'} · usage ${dnum(r.pro['USG%'], 1)}% · PER ${dnum(r.pro.PER, 1)} · ORtg ${dnum(r.pro.ORtg, 0)} / DRtg ${dnum(r.pro.DRtg, 0)}${r.pro.seasons > 1 ? ` · ${r.pro.seasons} pro seasons in the data` : ''}</p>` : ''}
    ${r.school_rep ? `<p class="small"><b>${esc(r.school_rep.school)} track record</b>${r.school_tier ? ` ${schoolPill(r.school_tier)}` : ''} (classes before ${year}): ${r.school_rep.n} prospects, ${Math.round(r.school_rep.played * 100)}% reached the NBA, ${Math.round(r.school_rep.lottery * 100)}% lottery picks, ${sgn(r.school_rep.vorp, 2)} VORP per season over their first four seasons.</p>` : ''}
    ${(r.comps || []).length ? `<p class="small"><b>Closest comparisons:</b> ${r.comps.map(c => `<span${compTitle(c)}>${esc(c.name)}</span> <span class="muted">(${dnum(c.sim, 2)})</span>`).join(', ')}</p>
    ${r.comps.some(c => /^\{\[.*\]\}$/.test(c.name.trim())) ? '<p class="small muted"><b>{[Name]}</b> = a height and weight match: the comparison was also about his size coming out.</p>' : ''}` : ''}
    <p class="small muted">Strengths and weaknesses are his best and worst skill grades relative to his draft class (top / bottom quarter). <a href="#drafts/${year}">${year} board →</a></p>`;
}
async function renderProspect(year, i) {
  const view = $('#view');
  const I = await getJSON('data/drafts/index.json');
  const D = await draftYear(year);
  const r = D.rows[Number(i)];
  if (!r) { view.innerHTML = '<p class="empty">Prospect not found.</p>'; return; }
  let season = null;
  if (r.pid) { try { season = await getJSON(`data/season/players/${r.pid}.json`); } catch (e) { season = null; } }
  view.innerHTML = `<a class="back" href="#drafts/${year}">← ${year} draft</a>
    <div class="hero"><div class="who"><h2 class="${dCls(r.style.name)}">${esc(r.name)}</h2>${year < new Date().getFullYear() || new Date().getMonth() > 5 ? ageLine(r.Age, year, null, r.pid) : ''}<p>${year} draft · ${esc(r.Info || '')}${r.pid ? ` · <a href="https://www.basketball-reference.com/players/${r.pid[0]}/${r.pid}.html">Basketball-Reference</a>` : ''}${season ? ` · <a href="#splayer/${r.pid}">${seasonLabel(S._season ? S._season.season : 2027)} games</a>` : ''}</p></div>
      ${r.nba ? `<div class="stat-tiles"><div class="tile"><div class="k">NBA so far</div><div class="v">${r.nba.mpg} min/g</div><div class="small muted">${r.nba.seasons} seasons, ${r.nba.games} games · BPM ${sgn(r.nba.bpm, 1)} · VORP ${r.nba.vorp}</div></div></div>` : ''}</div>
    <div id="sty-slot"></div>
    ${draftProfileBlock(r, year, I, D)}`;
  styleSlot(view, r.pid);
}

function renderMethod() {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild($('#method-tpl').content.cloneNode(true));
  $('#epm-seasons').textContent = S.epm_seasons.length ? S.epm_seasons.map(seasonLabel).join(', ') : 'no seasons yet';
  $('#first-season').textContent = seasonLabel(S.first_season);
  $('#team-start').textContent = S.team_horizon_start;
}

/* ---------- Player styles (gmrank/styles.py: the nba_api ratings tabs / PLAYERDEFENSEDROPDOWN) ---------- */
const STY_TYPES = { poa: 'Point-of-attack', aptitude: 'Underrated guard D', drop: 'Drop defender', nostocks: 'No stocks', uninvolved: 'Uninvolved', badc: 'Poor defensive C' };
const styBand = v => v == null ? '' : v === 0 ? 'sv-zero' : v >= 75 ? 'sv-elite' : v >= 60 ? 'sv-good' : v <= 25 ? 'sv-poor' : v >= 40 ? 'sv-mid' : '';
const styTone = l => /but good/.test(l) ? 'mid' : /\b(in|non|no|minimal|slow|poor|bad|below|prone|brickster|stopper|doesn't move|little|undisciplined|invisible|drop|non-threat)\b|inefficient|turnover/.test(l) ? 'bad'
  : /elite|excellent|efficient|very good|good|fast|mistake free|responsible|self-creator|sharpshooter|shot-blocker|clears|doesn't foul|feisty|underrated|versatile|defender$|disciplined|charge|body on|foul drawer|foul-drawing|second-chancer|alpha|star|threat|shooter|passer|ball mover|pressure|dunker|vertical/.test(l) ? 'good' : 'mid';
const styOrder = ls => [...ls].sort((a, b) => ({ good: 0, mid: 1, bad: 2 })[styTone(a)] - ({ good: 0, mid: 1, bad: 2 })[styTone(b)]);   // strengths, neutral, weaknesses
const styChips = ls => ls.length ? styOrder(ls).map(l => `<span class="d-tag ${styTone(l) === 'mid' ? '' : styTone(l)}">${esc(l)}</span>`).join('') : '<span class="muted small">no qualifying minutes</span>';
const styTypeTags = ts => ts.map(([k]) => `<span class="sty-type sty-${k}">${esc(STY_TYPES[k])}</span>`).join(' ');
const STY_GRADES = [[95, 'Elite', 'VERY_GOOD'], [80, 'Very good', 'VERY_GOOD'], [60, 'Good', 'GOOD'], [40, 'OK', 'OK'], [20, 'Bad', 'BAD'], [0, 'Very bad', 'VERY_BAD']];
const styGrade = (pct, tip = '') => { if (pct == null) return '<span class="muted">–</span>'; const g = STY_GRADES.find(x => pct >= x[0]); return `<span class="pill ${g[2]}" title="${pct}th percentile of the league${tip}">${g[1]}</span>`; };
let styIdx = null;
async function styIndex() { if (!styIdx) { styIdx = await getJSON('data/styles/index.json'); X_META = styIdx.meta; } return styIdx; }
async function styleByPid(pid) {
  if (!pid) return null;
  try { const X = await styIndex(); const e = X.players.find(p => p.pid === pid); return e ? { X, p: await getJSON(`data/styles/players/${e.id}.json`) } : null; } catch (e) { return null; }
}
function styTrend(p, key, label, X) {   // one small multiple: 0-100 within position, a dot per season, dashed career mean
  const yrs = X.meta.seasons, W = 168, H = 64, L = 4, R = 4, T = 6, B = 6;
  const x = y => L + (yrs.length < 2 ? (W - L - R) / 2 : (yrs.indexOf(y) / (yrs.length - 1)) * (W - L - R)), y = v => T + (1 - v / 100) * (H - T - B);
  const pts = yrs.map(s => [s, p.seasons[s] && p.seasons[s][key]]).filter(d => d[1] != null);
  const cm = p.career[key], last = pts.length ? pts[pts.length - 1][1] : null;
  const path = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d[0]).toFixed(1)},${y(d[1]).toFixed(1)}`).join('');
  return `<figure class="sty-sm"><figcaption><span>${esc(label)}</span><b class="${styBand(last)}">${last ?? '–'}</b></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} by season: ${pts.map(d => `${seasonLabel(d[0])} ${d[1]}`).join(', ')}">
      <line class="sty-mid" x1="${L}" x2="${W - R}" y1="${y(50)}" y2="${y(50)}"/>
      ${cm != null ? `<line class="sty-cm" x1="${L}" x2="${W - R}" y1="${y(cm)}" y2="${y(cm)}"/>` : ''}
      <path class="sty-line" d="${path}"/>
      ${pts.map(d => `<circle class="sty-dot" cx="${x(d[0])}" cy="${y(d[1])}" r="4"/><circle class="sty-hit" cx="${x(d[0])}" cy="${y(d[1])}" r="11" data-tip="${esc(label)} · ${seasonLabel(d[0])}: <b>${d[1]}</b>${cm != null ? ` (career ${cm})` : ''}"/>`).join('')}
    </svg></figure>`;
}
function styleBlock(p, X, heading = true) {
  const sy = seasonLabel(p.labels.season_year), off = X.meta.off_keys, dk = X.meta.def_keys;
  const live = p.labels.season_year >= X.meta.current;
  const lastWord = p.labels.season_year < X.meta.latest ? 'Latest tracked season' : 'Last season';
  const sLabel = live ? `This season (${sy}${p.blend ? `, ${Math.round(p.blend.weight * 100)}% this season / ${100 - Math.round(p.blend.weight * 100)}% his past` : ''})` : `${lastWord} (${sy}; ${seasonLabel(X.meta.current)} once tracked)`;
  const row = (kind, i) => `<div class="sty-row"><div class="sty-k">${kind}</div>
      <div><div class="small muted">Career style</div>${styChips(p.labels.career[i])}</div>
      <div><div class="small muted">${sLabel}</div>${styChips(p.labels.season[i])}</div></div>`;
  const yrs = Object.keys(p.seasons);
  const gk = { Offense: 'o_pct', Defense: 'd_pct' };
  const table = (keys, title) => `<div class="table-wrap"><table class="sty-table"><thead><tr><th>${title}</th>${yrs.map(s => `<th class="num">${seasonLabel(+s)}</th>`).join('')}<th class="num">Career</th></tr></thead><tbody>
      <tr><td class="nowrap"><b>${title} grade</b></td>${yrs.map(s => `<td class="num">${styGrade(p.seasons[s][gk[title]])}</td>`).join('')}<td class="num">${styGrade(p.grade && p.grade[gk[title][0]].overall)}</td></tr>
      ${keys.map(([k, l]) => `<tr><td class="nowrap">${esc(l)}</td>${yrs.map(s => { const v = p.seasons[s][k]; return `<td class="num ${styBand(v)}">${v ?? '–'}</td>`; }).join('')}<td class="num ${styBand(p.career[k])}">${p.career[k] ?? '–'}</td></tr>`).join('')}</tbody></table></div>`;
  return `<section class="sty-block">${heading ? `<h3>Player style <span class="muted small">· nba.com tracking, ${seasonLabel(X.meta.seasons[0])} to ${seasonLabel(X.meta.latest)}</span></h3>` : ''}
    ${p.types.season.length || p.types.career.length ? `<p class="small">${p.types.season.length ? `<b>Defender type (${sy}${p.blend ? ', blended' : ''}):</b> ${styTypeTags(p.types.season)} ` : ''}${p.types.career.length ? `<b>Career:</b> ${styTypeTags(p.types.career)}` : ''}</p>` : ''}
    ${p.grade ? `<div class="stat-tiles sty-grades">${[['o', 'Offense'], ['d', 'Defense']].map(([k, l]) => { const g = p.grade[k]; return `<div class="tile"><div class="k">${l}</div><div class="v">${styGrade(g.season)}</div><div class="small muted">${live ? 'this season' : `${lastWord.toLowerCase()} (${sy})`}${g.season != null ? `, ${g.season}th pct` : ''}<br>overall: ${styGrade(g.overall, ', seasons weighted by games, recent ones more')}</div></div>`; }).join('')}</div>
    <p class="small muted">Offense and defense grades compare him with every player that season (not just his position): offense weighs points per 48, true shooting, assists, ball security, usage and offensive rating; defense weighs shot defense (opponents' FG% vs normal), shots contested, at-rim defense, steals, blocks, defensive boards and defensive rating. Elite = top 5% of the league, very good 80th–95th percentile, good 60th–80th, OK 40th–60th, bad 20th–40th, very bad bottom 20%. Overall weights his seasons by games, each earlier season ×0.75.</p>` : ''}
    ${row('Offense', 0)}${row('Defense', 1)}
    ${stySummary(p)}
    ${styComplement(p)}
    <p class="small muted">Each trend is 0–100 against players at his position that season (higher = more of it, or better at it; ball security and discipline are inverted turnovers and fouls). Dots are seasons, the dashed line is his career average, the faint line is 50. Hover a dot for the value.</p>
    <h4>Offense trends</h4><div class="sty-grid">${off.map(([k, l]) => styTrend(p, k, l, X)).join('')}</div>
    <h4>Defense trends</h4><div class="sty-grid">${dk.map(([k, l]) => styTrend(p, k, l, X)).join('')}</div>
    <details class="sty-details"><summary>Season-by-season table</summary>${table(off, 'Offense')}${table(dk, 'Defense')}
      <p class="small muted">Colors follow the sheet: <span class="sv-elite">75+</span> · <span class="sv-good">60–74</span> · <span class="sv-mid">40–59</span> · <span class="sv-poor">25 or under</span> · <span class="sv-zero">0</span>.</p></details>
  </section>`;
}
const styList = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
function stySummary(p) {   // one sentence of strengths, one of weaknesses, from this season's and last season's labels
  const cur = [...p.labels.season[0], ...p.labels.season[1]], prev = p.labels.prev ? [...p.labels.prev[0], ...p.labels.prev[1]] : [];
  const yrs = p.labels.prev_year ? `${seasonLabel(p.labels.prev_year)} and ${seasonLabel(p.labels.season_year)}` : seasonLabel(p.labels.season_year);
  const pick = tone => { const both = cur.filter(l => styTone(l) === tone && prev.includes(l)), one = [...cur, ...prev].filter(l => styTone(l) === tone && !both.includes(l));
    return [...new Set([...both, ...one])].slice(0, 7); };
  const pros = pick('good'), cons = pick('bad');
  const av = p.pid && SALBY[p.pid] && SALBY[p.pid].avail, ayrs = av && av.seasons.length ? `${seasonLabel(av.seasons[0].season)}–${seasonLabel(av.seasons[av.seasons.length - 1].season)}` : '';
  if (av && av.label === 'Injury prone') cons.unshift(`injury prone (missed ${av.pct}% of games, ${ayrs})`);
  if (av && av.label === 'Durable') pros.push(`durable (missed ${av.pct}% of games, ${ayrs})`);
  return `<div class="sty-summary"><p><b>Strengths</b> (${yrs}): ${pros.length ? esc(styList(pros)) : 'nothing stands out in the tracking numbers'}.</p>
    <p><b>Weaknesses</b>: ${cons.length ? esc(styList(cons)) : 'no clear holes in the tracking numbers'}.</p>
    <p class="small muted">Labels seen in both seasons come first.</p></div>`;
}
function styComplement(p) {
  const c = p.complement, f = p.team_fit;
  if (!c && !f) return '';
  const ex = e => `<li><a href="#styles/${e.id}">${esc(e.name)}</a> <span class="muted small">(${seasonLabel(e.season)}${e.team ? ', ' + esc(e.team) : ''}; fit ${e.fit})</span>${e.shows.length ? ` <span class="small">${esc(styList(e.shows))}</span>` : ''}</li>`;
  const fw = !f ? '' : f.score >= 70 ? ['GOOD', 'brings what they need'] : f.score <= 30 ? ['BAD', 'mostly duplicates what they have'] : ['OK', 'a mix'];
  return `<h4>Best complement</h4>
    ${c ? `<p><b>${esc(c.archetype.charAt(0).toUpperCase() + c.archetype.slice(1))}</b>${c.ball ? ', who does not need the ball' : ''}. <span class="small muted">His gaps over the last two seasons: ${esc(styList(c.needs))}.</span></p>
    <div class="sty-comp"><div><div class="small muted">Best fits in ${seasonLabel(X_LATEST())}</div><ol>${c.now.map(ex).join('')}</ol></div>
      ${c.past.length ? `<div><div class="small muted">Earlier seasons</div><ol>${c.past.map(ex).join('')}</ol></div>` : ''}</div>
    <p class="small muted">Fit = the partner's average 0–100 score (within his position) on these gaps in that season (40+ games, 20+ min); ball-dominant players get partners with lower usage.</p>` : ''}
    ${f ? `<h4>Fit with the ${esc(f.team_name)} (${seasonLabel(X_CUR())})</h4>
      <p><span class="pill ${fw[0]}">${f.score}/100</span> ${fw[1]}. ${f.brings.length ? `He brings <b>${esc(styList(f.brings))}</b>, which the rest of the rotation lacks. ` : 'He adds little the rotation lacks. '}${f.duplicates.length ? `Already strong there: ${esc(styList(f.duplicates))}. ` : ''}<span class="muted">Rotation's biggest gaps: ${esc(styList(f.team_needs))}.</span></p>
      ${f.best_mate ? `<p>Best complement on the roster: <a href="#styles/${f.best_mate.id}">${esc(f.best_mate.name)}</a>${f.best_mate.covers.length ? ` (covers his ${esc(styList(f.best_mate.covers))})` : ''}.</p>` : ''}
      <p class="small muted">Score = percentile among every team's top-10 projected rotation (Outlook minutes): how much his strengths line up with what his teammates (minutes-weighted, last two seasons) lack, minus overlap with what they already do well.</p>` : ''}`;
}
let X_META = null;
const X_LATEST = () => X_META ? X_META.latest : 2026, X_CUR = () => X_META ? X_META.current : 2027;
function bindStyTips(view) {
  let tip = $('#sty-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'sty-tip'; tip.hidden = true; document.body.appendChild(tip); }
  view.querySelectorAll('.sty-hit').forEach(c => {
    c.addEventListener('mouseenter', () => { tip.innerHTML = c.dataset.tip; tip.hidden = false; const b = c.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 200, b.left + scrollX - 20) + 'px'; tip.style.top = (b.top + scrollY - 34) + 'px'; });
    c.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}
async function styleSlot(view, pid) {   // the style block on player / prospect pages, before the draft section
  const got = await styleByPid(pid), slot = $('#sty-slot', view);
  if (!got || !slot) return;
  slot.innerHTML = styleBlock(got.p, got.X) + `<p class="small"><a href="#styles">All player styles →</a></p>`;
  bindStyTips(slot);
}
async function renderStyles(id) {
  const view = $('#view');
  const X = await styIndex();
  if (id) {
    const p = await getJSON(`data/styles/players/${id}.json`);
    if (p.pid) { location.replace(`#splayer/${p.pid}`); return; }   // the full player page carries the style block
    let season = null;
    if (p.pid) { try { season = await getJSON(`data/season/players/${p.pid}.json`); } catch (e) { season = null; } }
    const last = p.seasons[p.labels.season_year];
    const da = await draftAge(p.pid);
    const fb = last.age != null ? Math.round(last.age + X.meta.current - p.labels.season_year) : null;
    view.innerHTML = `<a class="back" href="#styles">← Player styles</a>
      <div class="hero"><div class="who"><h2>${esc(p.name)}</h2>${ageLine(da && da.age, da && da.year, fb, p.pid)}<p>${p.cur_team ? `<a href="#season/${p.cur_team}">${esc(p.cur_team)}</a> (${seasonLabel(X.meta.current)})` : `${esc(last.team || '')} <span class="muted">(${seasonLabel(p.labels.season_year)}; not on a ${seasonLabel(X.meta.current)} roster)</span>`} · ${esc(p.pos || '')} · ${Object.keys(p.seasons).length} seasons tracked${season ? ` · <a href="#splayer/${p.pid}">${seasonLabel(S._season ? S._season.season : 2027)} games</a>` : ''}${p.pid ? ` · <a href="https://www.basketball-reference.com/players/${p.pid[0]}/${p.pid}.html">Basketball-Reference</a>` : ''}</p></div>
        <div class="stat-tiles"><div class="tile"><div class="k">Offense avg ${seasonLabel(p.labels.season_year)}</div><div class="v ${styBand(last.o_avg)}">${last.o_avg ?? '–'}</div><div class="small muted">career ${p.career.o_avg ?? '–'}</div></div>
          <div class="tile"><div class="k">Defense avg ${seasonLabel(p.labels.season_year)}</div><div class="v ${styBand(last.d_avg)}">${last.d_avg ?? '–'}</div><div class="small muted">career ${p.career.d_avg ?? '–'}</div></div>
          <div class="tile"><div class="k">Ratings (${seasonLabel(p.labels.season_year)})</div><div class="v small-v">${last.off_rating ?? '–'} / ${last.def_rating ?? '–'}</div><div class="small muted">off / def per 100</div></div></div></div>
      ${styleBlock(p, X, false)}`;
    bindStyTips(view);
    return;
  }
  const f = state.sty = Object.assign({ q: '', team: '', pos: '', mode: 'cur' }, state.sty || {});
  const teamOf = p => f.mode === 'cur' ? p.cur : f.mode === 'last' ? (p.last === X.meta.latest ? p.team : null) : (p.cur || p.team);
  const teams = [...new Set(X.players.map(p => p.cur).concat(X.players.map(p => p.team)).filter(Boolean))].sort();
  const cs = seasonLabel(X.meta.current);
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = X.players.filter(p => (f.mode === 'all' || teamOf(p)) && (f.mode !== 'last' || p.id != null) && (!q || p.name.toLowerCase().includes(q)) && (!f.team || teamOf(p) === f.team) && (!f.pos || (p.pos || '').includes(f.pos)));
    $('#sty-body').innerHTML = rows.slice(0, 600).map(p => p.id == null ? `<tr class="link" data-href="#splayer/${p.pid}"><td class="name-cell"><a href="#splayer/${p.pid}">${esc(p.name)}</a></td><td>${esc(p.cur || '')}</td><td>${esc(p.pos || '')}</td><td class="num">0</td><td colspan="4" class="small muted">${p.rookie ? 'Rookie: ' : ''}no NBA tracking yet${p.rookie ? '' : ' (under the scripts\' minutes cutoff)'}</td></tr>`
      : `<tr class="link" data-href="${p.pid ? `#splayer/${p.pid}` : `#styles/${p.id}`}"><td class="name-cell"><a href="${p.pid ? `#splayer/${p.pid}` : `#styles/${p.id}`}">${esc(p.name)}</a></td><td>${teamOf(p) ? esc(teamOf(p)) : `<span class="muted">${esc(p.team || '')} ${seasonLabel(p.last)}</span>`}${f.mode === 'last' && p.cur && p.cur !== p.team ? ` <span class="muted small">→ ${esc(p.cur)}</span>` : ''}</td><td>${esc(p.pos || '')}</td><td class="num">${p.n}</td>
      <td>${styGrade(p.og)}</td><td>${styGrade(p.dg)}</td><td class="small hide-sm">${styOrder(p.off).map(l => `<span class="d-tag ${styTone(l) === 'mid' ? '' : styTone(l)}">${esc(l)}</span>`).join('')}</td>
      <td class="small hide-sm">${styOrder(p.def).map(l => `<span class="d-tag ${styTone(l) === 'mid' ? '' : styTone(l)}">${esc(l)}</span>`).join('')} ${p.types.map(k => `<span class="sty-type sty-${k}">${STY_TYPES[k]}</span>`).join(' ')}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No players match.</td></tr>';
    $('#sty-count').textContent = `${rows.length} players`;
    bindRowLinks(view);
  };
  view.innerHTML = `<h2>Player styles</h2>
    <p class="muted">How every NBA player scores and defends, from nba.com tracking (shot defense by distance, hustle, speed, dunks and rim attempts) as gathered by our nba_api scripts, ${seasonLabel(X.meta.seasons[0])} to ${seasonLabel(X.meta.latest)}. Each stat is 0–100 against his position that season; the style labels and defender types follow the PLAYERDEFENSEDROPDOWN sheet. Teams and the roster filter are ${cs}; the styles are ${X.meta.latest >= X.meta.current ? `${cs} (early in the season each player's is blended with his past seasons by games played)` : `from ${seasonLabel(X.meta.latest)} until ${cs} tracking is added`}. Open a player for his career trends.</p>
    <div class="toolbar"><input id="sty-q" type="search" placeholder="Search players" value="${esc(f.q)}" aria-label="Search players">
      <select id="sty-team" aria-label="Team"><option value="">All teams</option>${teams.map(t => `<option ${f.team === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="sty-pos" aria-label="Position"><option value="">All positions</option>${['G', 'F', 'C'].map(t => `<option value="${t}" ${f.pos === t ? 'selected' : ''}>${{ G: 'Guards', F: 'Forwards', C: 'Centers' }[t]}</option>`).join('')}</select>
      <select id="sty-mode" aria-label="Rosters">${[['cur', `${cs} rosters`], ['last', `${seasonLabel(X.meta.latest)} teams`], ['all', 'All players since ' + seasonLabel(X.meta.seasons[0])]].map(([k, l]) => `<option value="${k}" ${f.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select> <span id="sty-count" class="muted small"></span></div>
    <div class="table-wrap"><table><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th class="num">Seasons</th><th title="Offense grade vs the whole league (${X.meta.latest >= X.meta.current ? cs : seasonLabel(X.meta.latest)})">Offense</th><th title="Defense grade vs the whole league">Defense</th><th class="hide-sm">Offense style (${X.meta.latest >= X.meta.current ? cs : `last season, ${seasonLabel(X.meta.latest)}`})</th><th class="hide-sm">Defense style</th></tr></thead><tbody id="sty-body"></tbody></table></div>
    <p class="small muted">Defender types (the sheet's name colors): ${Object.keys(STY_TYPES).map(k => `<span class="sty-type sty-${k}">${STY_TYPES[k]}</span>`).join(' ')}</p>`;
  $('#sty-q').addEventListener('input', e => { f.q = e.target.value; draw(); });
  $('#sty-team').addEventListener('change', e => { f.team = e.target.value; save(); draw(); });
  $('#sty-pos').addEventListener('change', e => { f.pos = e.target.value; save(); draw(); });
  $('#sty-mode').addEventListener('change', e => { f.mode = e.target.value; save(); draw(); });
  draw();
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash.replace(/^#/, '') || 'gms';
  const [page, arg] = h.split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === (page === 'gm' || page === 'former' ? 'gms' : page === 'team' ? 'teams' : page === 'coach' || page === 'fcoach' ? 'coaches' : page === 'injuries' ? 'outlook' : page === 'game' || page === 'splayer' ? 'season' : page === 'prospect' ? 'drafts' : page === 'sty' ? 'styles' : page)));
  const view = $('#view');
  view.hidden = false;
  view.classList.remove('hide-initial');
  try {
    if (page === 'splayer' || page === 'prospect' || page === 'styles' || page === 'salary') await BIRTHS_P;
    if (page === 'gm' && arg) await renderGM(arg);
    else if (page === 'former' && arg) await renderGM(arg, true);
    else if (page === 'coaches') renderCoaches();
    else if (page === 'outlook' && arg) await renderOutlookTeam(arg);
    else if (page === 'outlook') renderOutlook();
    else if (page === 'injuries') await renderInjuries();
    else if (page === 'season') await renderSeason(arg);
    else if (page === 'game') await renderGame(arg);
    else if (page === 'splayer') await renderSeasonPlayer(arg);
    else if (page === 'styles') await renderStyles(arg);
    else if (page === 'salary') renderSalary();
    else if (page === 'drafts') await renderDrafts(arg, h.split('/')[2]);
    else if (page === 'prospect') await renderProspect(arg, h.split('/')[2]);
    else if (page === 'coach' && arg) await renderCoach(arg, false);
    else if (page === 'fcoach' && arg) await renderCoach(arg, true);
    else if (page === 'team' && arg) await renderTeam(arg);
    else if (page === 'teams') renderTeams();
    else if (page === 'method') renderMethod();
    else renderGMs();
  } catch (e) {
    view.innerHTML = `<p class="empty">Could not load this page (${esc(e.message)}).</p>`;
  }
  window.scrollTo(0, 0);
}

(function version() {
  const el = $('#app-version');
  if (el) el.textContent = 'v' + el.dataset.version;
})();

(async function init() {
  try {
    S = await getJSON('data/summary.json');
  } catch (e) {
    $('#loading').textContent = 'No data yet: the first scrape is still running. Refresh in a few minutes.';
    return;
  }
  $('#loading').hidden = true;
  const built = new Date(S.built);
  $('#updated').textContent = `Updated ${built.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · season ${seasonLabel(S.current_season)} · refreshed monthly`;
  addEventListener('hashchange', route);
  route();
})();
