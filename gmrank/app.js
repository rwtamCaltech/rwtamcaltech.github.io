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
        <td>${esc(p.name)}${p.exp === 'R' ? ' <span class="pill OK">ROOKIE</span>' : ''}${p.tw ? ' <span class="pill N_A">TWO-WAY</span>' : ''}${p.breakout ? ' <span class="pill GOOD" title="Young, projected for a real role, and a big jump in impact or minutes">BREAKOUT?</span>' : ''}${p.strong_finish ? ` <span class="pill GOOD" title="Game score per 36 over his last ${p.late.n} games: ${p.late.gmsc36_late} vs ${p.late.gmsc36} for the season">STRONG FINISH</span>` : ''}${p.regression ? ' <span class="pill BAD" title="Minutes per game fell below 75% of the season before (a demotion, not injuries), so no development bump">REGRESSION?</span>' : ''}
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
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Team</th><th class="num">Games</th><th class="num">Min / game</th><th class="num">Score</th><th>Grade</th></tr></thead><tbody>
      ${(Z.top_players || []).map((p, i) => `<tr class="link" data-href="#splayer/${p.pid}"><td class="rank">${i + 1}</td><td><a href="#splayer/${p.pid}">${esc(p.name)}</a></td>
        <td><span class="team-tag">${p.team}</span></td><td class="num">${p.graded}</td><td class="num">${p.mpg}</td><td class="num strong">${sgn(p.score, 1)}</td><td>${gradePill(p.grade)}</td></tr>`).join('')}</tbody></table></div>
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
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th class="num">Games</th><th class="num">Min / game</th><th class="num">Score</th><th>Grade</th></tr></thead><tbody>
      ${t.players.map((p, i) => `<tr class="link" data-href="#splayer/${p.pid}"><td class="rank">${i + 1}</td><td><a href="#splayer/${p.pid}">${esc(p.name)}</a></td><td class="num">${p.games}</td><td class="num">${p.mpg}</td><td class="num">${p.score == null ? '–' : sgn(p.score, 1)}</td><td>${gradePill(p.grade)}</td></tr>`).join('')}</tbody></table></div>`;
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
        <th class="num" title="Game impact on the BPM scale (estimated from game score per 36)">Game impact</th><th class="num" title="Expected impact going in">Expected</th><th>Grade</th></tr></thead><tbody>
      ${T.rows.map(r => r.mp > 0 ? `<tr><td class="nowrap"><a href="#splayer/${r.pid}">${esc(r.name)}</a>${r.starter ? '' : ' <span class="muted small">bench</span>'}</td><td class="num">${r.mp.toFixed(0)}</td><td class="num">${r.pts}</td><td class="num">${r.trb}</td><td class="num">${r.ast}</td><td class="num hide-sm">${r.stl}</td><td class="num hide-sm">${r.blk}</td><td class="num hide-sm">${r.tov}</td>
        <td class="num">${sgn(r.pm, 0)}</td><td class="num">${r.bpm == null ? '–' : sgn(r.bpm, 1)}</td><td class="num">${sgn(r.exp, 1)}</td>
        <td title="${r.parts ? `box ${sgn(r.parts.bpm, 1)}, vs expectation ${sgn(r.parts.vs_exp, 1)}, +/- vs team ${sgn(r.parts.pm_rel, 1)}, counterparts ${sgn(r.parts.counterparts, 1)}` : 'under 10 minutes'}">${gradePill(r.grade)}${r.score != null ? ` <span class="rk">${sgn(r.score, 1)}</span>` : ''}</td></tr>`
        : `<tr class="muted"><td>${esc(r.name)}</td><td colspan="11" class="small">${esc(r.dnp || 'Did not play')}</td></tr>`).join('')}</tbody></table></div>
      ${T.absent.length ? `<p class="small">Missing rotation players (injury score ${(tm === g.home ? g.inj_home : g.inj_away).toFixed(1)}): ${T.absent.map(a => `${esc(a.name)} <span class="muted">(${a.mpg} min/g, impact ${sgn(a.impact, 1)})</span>`).join(', ')}</p>` : ''}`;
  };
  view.innerHTML = `<a class="back" href="#season">← Games</a>
    <div class="hero"><div class="who"><h2>${esc(gameLabel(g))}</h2><p>${fmtDate(g.date)}</p></div>
      <div class="stat-tiles">
        <div class="tile"><div class="k">Expected</div><div class="v">${g.exp_margin >= 0 ? g.home : g.away} by ${Math.abs(g.exp_margin).toFixed(1)}</div></div>
        <div class="tile"><div class="k">Actual</div><div class="v">${g.margin >= 0 ? g.home : g.away} by ${Math.abs(g.margin)}</div></div>
        <div class="tile"><div class="k">Over / under</div><div class="v">${g.diff >= 0 ? g.home : g.away} ${sgn(Math.abs(g.diff), 1)}</div><div class="small muted">added to ${esc(g.coach_home || g.home)} (${sgn(g.diff, 1)}) and ${esc(g.coach_away || g.away)} (${sgn(-g.diff, 1)})</div></div>
      </div></div>
    <p class="lede">Grades (10+ minutes): 0.55 × his game impact (so a great box score earns an A whoever he is) + 0.30 × game impact vs his expectation + 0.15 × his +/− per 36 relative to his team's margin − 0.20 × how far his positional counterparts (same position group, similar minutes) beat their own expectations. A game impact of +12 or game score 28+ is at least an A−. Hover a grade for its parts.</p>
    ${side(g.away)}${side(g.home)}`;
}
async function renderSeasonPlayer(pid) {
  const view = $('#view');
  const p = await getJSON(`data/season/players/${pid}.json`);
  view.innerHTML = `<a class="back" href="#season/${p.team}">← ${esc(p.team)}</a>
    <div class="hero"><div class="who"><h2>${esc(p.name)}</h2><p><span class="team-tag">${p.team}</span><a href="#season/${p.team}">${esc(p.team)}</a> · ${p.games} games, ${p.mpg} min/game</p></div>
      <div class="stat-tiles"><div class="tile"><div class="k">Season grade</div><div class="v">${gradePill(p.grade)}</div><div class="small muted">${p.score == null ? 'no graded games' : `score ${sgn(p.score, 1)} over ${p.graded} graded games`}</div></div></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Game</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">+/−</th><th class="num">Game impact</th><th class="num">Expected</th><th>Grade</th></tr></thead><tbody>
      ${[...p.log].reverse().map(x => `<tr class="link" data-href="#game/${x.id}"><td class="nowrap">${fmtDate(x.date)}</td><td class="nowrap"><a href="#game/${x.id}">${x.home ? 'vs' : '@'} ${x.opp}</a> <span class="muted small">${x.result} ${sgn(x.margin, 0)}</span></td>
        <td class="num">${(x.mp || 0).toFixed(0)}</td><td class="num">${x.pts ?? '–'}</td><td class="num">${x.trb ?? '–'}</td><td class="num">${x.ast ?? '–'}</td><td class="num">${sgn(x.pm, 0)}</td><td class="num">${x.bpm == null ? '–' : sgn(x.bpm, 1)}</td><td class="num">${sgn(x.exp, 1)}</td><td>${gradePill(x.grade)}</td></tr>`).join('')}</tbody></table></div>`;
  bindRowLinks(view);
}

function renderMethod() {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild($('#method-tpl').content.cloneNode(true));
  $('#epm-seasons').textContent = S.epm_seasons.length ? S.epm_seasons.map(seasonLabel).join(', ') : 'no seasons yet';
  $('#first-season').textContent = seasonLabel(S.first_season);
  $('#team-start').textContent = S.team_horizon_start;
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash.replace(/^#/, '') || 'gms';
  const [page, arg] = h.split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === (page === 'gm' || page === 'former' ? 'gms' : page === 'team' ? 'teams' : page === 'coach' || page === 'fcoach' ? 'coaches' : page === 'injuries' ? 'outlook' : page === 'game' || page === 'splayer' ? 'season' : page)));
  const view = $('#view');
  view.hidden = false;
  view.classList.remove('hide-initial');
  try {
    if (page === 'gm' && arg) await renderGM(arg);
    else if (page === 'former' && arg) await renderGM(arg, true);
    else if (page === 'coaches') renderCoaches();
    else if (page === 'outlook' && arg) await renderOutlookTeam(arg);
    else if (page === 'outlook') renderOutlook();
    else if (page === 'injuries') await renderInjuries();
    else if (page === 'season') await renderSeason(arg);
    else if (page === 'game') await renderGame(arg);
    else if (page === 'splayer') await renderSeasonPlayer(arg);
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
