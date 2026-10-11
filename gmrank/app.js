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
  const rows = [...S.gms].sort((a, b) => (b.scores[key][metric] ?? -1e9) - (a.scores[key][metric] ?? -1e9));
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
    <p class="small muted">† Tenure began before ${seasonLabel(S.first_season)}; only moves from then on are counted. Per-season scores mix in 3 seasons of league-average performance, so GMs with short tenures are pulled toward average until they build a record. Ratings compare each score per season with the other GMs. Hover a score for its rank.</p>`;
  bindMetric(view, renderGMs);
  view.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => { state.sortKey = th.dataset.sort; save(); renderGMs(); }));
  bindRowLinks(view);
}

function formerTable(key, metric) {
  const rows = [...(S.former_gms || [])].sort((a, b) => (b.scores[key][metric] ?? -1e9) - (a.scores[key][metric] ?? -1e9));
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
      <thead><tr><th>#</th><th>Team</th><th class="hide-sm">Current GM</th><th class="num hide-sm">Moves</th>
      ${MAIN_COLS.map(([k, l]) => sortHead(k, l, key)).join('')}</tr></thead>
      <tbody>${rows.map((t, i) => {
        const gm = S.gms.find(g => g.team === t.team);
        return `<tr class="link" data-href="#team/${t.team}">
          <td class="rank">${i + 1}</td>
          <td class="name"><span class="team-tag">${t.team}</span><a href="#team/${t.team}">${esc(t.team_name)}</a></td>
          <td class="hide-sm">${gm ? `<a href="#gm/${t.team}">${esc(gm.name)}</a>` : '–'}</td>
          <td class="num hide-sm">${t.scores.overall.count}</td>
          ${MAIN_COLS.map(([k]) => scoreCell(t.scores[k], metric)).join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="small muted">Per season divides by the length of the horizon. Ratings compare each team with the other 29 over the same horizon.</p>`;
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
  if (it.initial_label && it.category !== 'draft') h += `<div class="small ini" style="margin-top:6px">Initial: ${pill(it.initial_label)} · Resolved: ${pill(it.resolved_label)} · Headline uses the <b>${it.headline_kind}</b> score${it.headline_kind === 'initial' ? ' (less than 70% played out)' : ''}.</div>`;
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

function styleSection(d) {
  const st = d.style, M = S.style_metrics;
  if (!st || !st.seasons || !st.seasons.length) {
    return `<h3>Roster profile</h3><p class="small muted">No completed season under this GM yet; the profile appears after their first full season.</p>`;
  }
  const of = st.ranked_of;
  const list = xs => xs.map(x => `<b>${esc(x.noun)}</b> <span class="muted">(#${x.gm_rank}/${of})</span>`).join(', ');
  const head = `<tr><th>Season</th>${M.map(m => `<th class="num" title="${m.higher_better ? 'Higher is better' : 'Lower is better'}">${esc(m.label)}</th>`).join('')}</tr>`;
  const cell = (key, c) => c ? `<td class="num ${zClass(c.z)}" title="z ${c.z >= 0 ? '+' : ''}${c.z} vs league that season">${fmtMetric(key, c.v)}<div class="rk">#${c.rank}</div></td>` : '<td class="num">–</td>';
  const rows = [...st.seasons].reverse().map(r => `<tr><td class="nowrap">${seasonLabel(r.season)}${r.record && r.record[0] != null ? `<div class="rk">${r.record[0]}-${r.record[1]}</div>` : ''}</td>${M.map(m => cell(m.key, r.metrics[m.key])).join('')}</tr>`).join('');
  const avg = `<tr class="sum"><td>Average</td>${M.map(m => { const a = st.avg[m.key]; return a ? `<td class="num ${zClass(a.z)}">${a.z >= 0 ? '+' : ''}${a.z.toFixed(2)}<div class="rk">avg rank ${a.rank_avg}</div></td>` : '<td></td>'; }).join('')}</tr>`;
  const gmr = `<tr class="sum"><td>Rank among GMs</td>${M.map(m => { const a = st.avg[m.key]; return a ? `<td class="num strong">${a.gm_rank} / ${a.of}</td>` : '<td></td>'; }).join('')}</tr>`;
  return `<h3>Roster profile (value set)</h3>
    <p class="lede">What this GM's teams were good and bad at, season by season (${st.seasons.length} completed season${st.seasons.length > 1 ? 's' : ''} in charge). Each cell is the team's rate and its league rank that season; colors compare it with the other 29 teams that year (z-score; for turnovers and points allowed, lower is better), so different eras are comparable.</p>
    <div class="stat-tiles" style="margin-bottom:12px">
      <div class="tile"><div class="k">Strengths</div><div class="small">${st.strengths.length ? list(st.strengths) : '<span class="muted">none in the top third of GMs</span>'}</div></div>
      <div class="tile"><div class="k">Weaknesses</div><div class="small">${st.weaknesses.length ? list(st.weaknesses) : '<span class="muted">none in the bottom third of GMs</span>'}</div></div>
      <div class="tile"><div class="k">Overall level</div><div class="v">#${st.level_rank} / ${of}</div><div class="small muted">average z ${st.level >= 0 ? '+' : ''}${st.level}</div></div>
      <div class="tile"><div class="k">Roster balance</div><div class="v">#${st.balance_rank} / ${of}</div><div class="small muted">avg shortfall ${st.shortfall} (0 = no weak spots)</div></div>
      <div class="tile"><div class="k">Specialization</div><div class="v">${st.spread >= 0.8 ? 'Specialist' : st.spread >= 0.5 ? 'Mixed' : 'Generalist'}</div><div class="small muted">spread ${st.spread} · #${st.spec_rank} most specialized</div></div>
    </div>
    <div class="table-wrap"><table class="style-table"><thead>${head}</thead><tbody>${rows}${avg}${gmr}</tbody></table></div>`;
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
    <div class="toolbar">${initialToggle()}<span class="small muted">Off: only resolved scores (what actually happened; unfinished parts use the day-of estimate).</span></div>
    <h3>Scores by category</h3>${categoryTable(sc)}
    ${styleSection(d)}
    <h3>Best and worst moves</h3>${bestWorst(d)}
    ${movesSection(d.items)}`;
  bindMoves(view, d.items);
  bindInitialToggle(view);
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
  view.innerHTML = `<a class="back" href="#teams">← All teams</a>
    <div class="hero"><div class="who"><h2>${esc(d.team_name)}</h2>
      <p>${d.gm ? `Current GM: <a href="#gm/${team}">${esc(d.gm.name)}</a> (since ${monthYear(d.gm.start_date)}) · ` : ''}moves since ${S.team_horizon_start}</p></div>
      <div class="stat-tiles">${tiles}</div></div>
    <div class="toolbar">${initialToggle()}<span class="small muted">Off: only resolved scores (what actually happened; unfinished parts use the day-of estimate).</span></div>
    <h3>Scores by category <span class="small muted">(${esc(S.horizons[h])}; change on the Teams page)</span></h3>${categoryTable(ts.scores)}
    <h3>Best and worst moves since ${S.team_horizon_start}</h3>${bestWorst(d)}
    ${movesSection(d.items)}`;
  bindMoves(view, d.items);
  bindInitialToggle(view);
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
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === (page === 'gm' || page === 'former' ? 'gms' : page === 'team' ? 'teams' : page)));
  const view = $('#view');
  view.hidden = false;
  view.classList.remove('hide-initial');
  try {
    if (page === 'gm' && arg) await renderGM(arg);
    else if (page === 'former' && arg) await renderGM(arg, true);
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
