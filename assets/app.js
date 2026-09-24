// data/log.json は .github/workflows/sync-sheet.yml が
// Googleスプレッドシート(日次タブ・ワークアウトタブ)から自動生成するファイル。
// 手元でまだ実行していない場合、または記録がまだない場合は
// 空の状態(empty state)がそのまま表示される。
// 数字は「並べて見せる」だけで、医学的な解釈は載せない。

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const dim = cssVar('--text-dim', '#9CA6B4');
const line = cssVar('--line', '#2B313B');
Chart.defaults.color = dim;
Chart.defaults.borderColor = line;
Chart.defaults.font.family = "Inter, system-ui, sans-serif";

const COLOR = { apple: '#8FA8C7', air: '#B98BD9', machine: '#7A8494' };
const APPLE = 'Apple Watch SE3';   // スプレッドシートの「デバイス」列の値
const AIR = 'Fitbit Air';

// ---- 静的な価格比較(公式発表ベース。ここは手動更新でOK) ----
// 「〜から」の最低価格の構成。2026年9月時点のApple公式サイト・Googleストアの表記。
// TODO(公開前に確認): 価格は公開の直前に、公式ページで再確認する。
const priceData = {
  labels: ['SE 3 + Air 合計', 'Apple Watch Series 12(から)', 'Apple Watch Ultra 4(から)'],
  values: [41800 + 16800, 71800, 142800]
};

new Chart(document.getElementById('priceChart'), {
  type: 'bar',
  data: {
    labels: priceData.labels,
    datasets: [{
      data: priceData.values,
      backgroundColor: [COLOR.apple, '#3E4652', '#3E4652'],
      borderRadius: 3,
      barThickness: 36
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '¥' + c.parsed.x.toLocaleString() } } },
    scales: {
      x: { ticks: { callback: (v) => '¥' + Number(v).toLocaleString() }, grid: { color: line } },
      y: { grid: { display: false } }
    }
  }
});

// スプレッドシート由来の文字をHTMLに埋め込む前に、< > & などを無害な表記に置き換える
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function emptyState(el, title, body) {
  el.innerHTML = `<div class="empty-state"><strong>${title}</strong>${body}</div>`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function fmt(v, digits = 0) {
  return isNum(v) ? v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
}

// ======================== 日々の記録(折れ線グラフ) ========================

// note: 定義の違いなど、グラフの下に添える注意書き
const METRICS = [
  { key: 'steps', label: '歩数', unit: '歩', digits: 0 },
  { key: 'activeMinutes', label: '運動時間', unit: '分', digits: 0,
    note: '「運動時間」は、Apple Watch と Fitbit Air で定義が異なる可能性があります。それぞれの機器の数字をそのまま並べています。' },
  { key: 'activeCalories', label: 'アクティブ消費カロリー', unit: 'kcal', digits: 0,
    note: '動いた分の消費カロリーです。安静時を含む「総消費カロリー」とは別の項目です。' },
  { key: 'totalCalories', label: '総消費カロリー', unit: 'kcal', digits: 0,
    note: '安静時を含む1日の消費カロリーです。算出方法は機器ごとに異なる可能性があります。' },
  { key: 'sleepHours', label: '睡眠時間', unit: '時間', digits: 1,
    note: '2台とも着けて寝た夜だけ、比べられます。' },
  { key: 'distanceKm', label: '移動距離', unit: 'km', digits: 2 },
  { key: 'restingHr', label: '安静時心拍', unit: 'bpm', digits: 0,
    note: '数字を並べているだけで、良し悪しの判断はしません。' },
];

let trendChart = null;
let diffChart = null;

// 週の始まり(月曜)の日付 'YYYY-MM-DD' を返す
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// 指定の項目・表示方法で、機器ごとの { ラベル: 値 } を作る。欠測日は除く。
function buildSeries(dailyLogs, metric, mode) {
  const perDevice = { [APPLE]: {}, [AIR]: {} };
  for (const d of dailyLogs) {
    if (!(d.device in perDevice) || d.missing || !isNum(d[metric])) continue;
    const label = mode === 'week' ? weekStart(d.date) : d.date;
    (perDevice[d.device][label] ||= []).push(d[metric]);
  }
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const labels = [...new Set([...Object.keys(perDevice[APPLE]), ...Object.keys(perDevice[AIR])])].sort();
  const pick = (dev) => labels.map(l => perDevice[dev][l] ? avg(perDevice[dev][l]) : null);
  return { labels, apple: pick(APPLE), air: pick(AIR) };
}

function drawTrend(dailyLogs, metricKey, mode) {
  const metric = METRICS.find(m => m.key === metricKey);
  const { labels, apple, air } = buildSeries(dailyLogs, metricKey, mode);
  const label = mode === 'week' ? '週平均' : '日ごと';
  const round = (v) => (isNum(v) ? Number(v.toFixed(metric.digits + 1)) : null);

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: `Apple Watch SE 3(${label})`, data: apple.map(round), borderColor: COLOR.apple, backgroundColor: COLOR.apple, tension: 0.3, spanGaps: true },
        { label: `Fitbit Air(${label})`, data: air.map(round), borderColor: COLOR.air, backgroundColor: COLOR.air, tension: 0.3, spanGaps: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { grid: { color: line }, title: { display: true, text: metric.unit } },
        x: { grid: { display: false } }
      }
    }
  });

  // 2台の差(Apple Watch − Fitbit Air)。両方の値がある日・週だけ計算する
  const diff = labels.map((_, i) => (isNum(apple[i]) && isNum(air[i]) ? Number((apple[i] - air[i]).toFixed(metric.digits + 1)) : null));
  if (diffChart) diffChart.destroy();
  diffChart = new Chart(document.getElementById('diffChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: `差(Apple Watch − Fitbit Air・${metric.unit})`, data: diff, backgroundColor: COLOR.machine, borderRadius: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { grid: { color: line }, title: { display: true, text: metric.unit } }, x: { grid: { display: false } } }
    }
  });

  const missingCount = dailyLogs.filter(d => d.missing).length;
  const notes = [];
  if (metric.note) notes.push(metric.note);
  if (missingCount > 0) notes.push(`欠測の印が付いた記録(${missingCount}件)は、グラフから除いています。`);
  document.getElementById('trendNote').textContent = notes.join(' ');
}

function renderTrend(dailyLogs) {
  const el = document.getElementById('trendArea');
  if (!dailyLogs || dailyLogs.length === 0) {
    emptyState(el, 'まだ記録がありません',
      'スプレッドシートの「日次」タブに歩数などを入力すると、週に1回の自動更新で、ここに折れ線グラフが表示されます。');
    return;
  }
  const available = METRICS.filter(m => dailyLogs.some(d => isNum(d[m.key])));
  if (available.length === 0) {
    emptyState(el, 'まだ記録がありません', '歩数などの数値が入力されると、ここに表示されます。');
    return;
  }
  el.innerHTML = `
    <div class="chart-controls">
      <label>項目 <select id="metricSelect">${available.map(m => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
      <label>表示 <select id="modeSelect"><option value="day">日ごと</option><option value="week">週平均</option></select></label>
    </div>
    <p id="trendNote" class="chart-note"></p>
    <div class="chart-box"><canvas id="trendChart"></canvas></div>
    <h3 class="chart-subtitle">2台の差(Apple Watch − Fitbit Air)</h3>
    <div class="chart-box short"><canvas id="diffChart"></canvas></div>`;
  const metricSelect = document.getElementById('metricSelect');
  const modeSelect = document.getElementById('modeSelect');
  const redraw = () => drawTrend(dailyLogs, metricSelect.value, modeSelect.value);
  metricSelect.addEventListener('change', redraw);
  modeSelect.addEventListener('change', redraw);
  redraw();
}

// ======================== ワークアウト(1回ごとの比較) ========================

let distanceChart = null;

function diffText(pct) {
  if (!isNum(pct)) return '';
  const sign = pct > 0 ? '+' : '';
  return `<small class="diff">差 ${sign}${pct.toFixed(1)}%</small>`;
}

function workoutCard(w) {
  const a = w.apple || {}, f = w.fitbit || {}, m = w.machine || {};
  // [項目, 単位, 機器の表示, Apple Watch, Fitbit Air, 桁数, 差を出すか]
  const rows = [
    ['距離', 'km', m.distanceKm, a.distanceKm, f.distanceKm, 2, true],
    ['時間', '分', null, a.minutes, f.minutes, 0, false],
    ['平均心拍', 'bpm', null, a.avgHr, f.avgHr, 0, false],
    ['最大心拍', 'bpm', null, a.maxHr, f.maxHr, 0, false],
    ['消費カロリー', 'kcal', m.calories, a.calories, f.calories, 0, false],
    ['出力', 'W', m.powerW, null, null, 0, false],
    ['ケイデンス', 'rpm', m.cadenceRpm, null, null, 0, false],
  ].filter(r => [r[2], r[3], r[4]].some(isNum));

  const body = rows.map(([label, unit, mv, av, fv, digits, showDiff]) => `
    <tr>
      <th scope="row">${esc(label)}<span class="unit">${esc(unit)}</span></th>
      <td>${fmt(mv, digits)}</td>
      <td>${fmt(av, digits)}${showDiff ? diffText(a.distanceDiffPct) : ''}</td>
      <td>${fmt(fv, digits)}${showDiff ? diffText(f.distanceDiffPct) : ''}</td>
    </tr>`).join('');
  const meta = [
    w.fitbitPlacement ? `Fitbit Air の装着位置: ${esc(w.fitbitPlacement)}` : '',
    w.note ? `条件: ${esc(w.note)}` : ''
  ].filter(Boolean).join(' ／ ');

  return `
    <article class="workout-card">
      <h3><span class="date">${esc(w.date)}</span> ${esc(w.type)}</h3>
      ${meta ? `<p class="meta">${meta}</p>` : ''}
      <div class="table-scroll">
        <table class="compare-table">
          <thead><tr><th></th><th>機器表示</th><th>Apple Watch</th><th>Fitbit Air</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </article>`;
}

function drawDistanceChart(workoutLogs) {
  // 距離が2つ以上の機器で記録されているワークアウトだけを棒グラフにする
  const rows = workoutLogs.filter(w => [w.machine?.distanceKm, w.apple?.distanceKm, w.fitbit?.distanceKm].filter(isNum).length >= 2);
  const wrap = document.getElementById('distanceChartWrap');
  if (!wrap) return;
  if (rows.length === 0) { wrap.hidden = true; return; }
  wrap.hidden = false;
  if (distanceChart) distanceChart.destroy();
  distanceChart = new Chart(document.getElementById('distanceChart'), {
    type: 'bar',
    data: {
      labels: rows.map(w => `${w.date} ${w.type}`),
      datasets: [
        { label: '機器の表示', data: rows.map(w => w.machine?.distanceKm ?? null), backgroundColor: COLOR.machine, borderRadius: 2 },
        { label: 'Apple Watch SE 3', data: rows.map(w => w.apple?.distanceKm ?? null), backgroundColor: COLOR.apple, borderRadius: 2 },
        { label: 'Fitbit Air', data: rows.map(w => w.fitbit?.distanceKm ?? null), backgroundColor: COLOR.air, borderRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { grid: { color: line }, title: { display: true, text: 'km' } }, x: { grid: { display: false } } }
    }
  });
}

function renderWorkouts(workoutLogs) {
  const el = document.getElementById('workoutArea');
  if (!workoutLogs || workoutLogs.length === 0) {
    emptyState(el, 'ワークアウトの記録はまだありません',
      'トレッドミル、インドアサイクリング、バスケットボールなどを両デバイスで計測したら、距離・時間・心拍・消費カロリーを並べて表示します。');
    return;
  }
  const sorted = [...workoutLogs].sort((x, y) => String(y.date).localeCompare(String(x.date)));
  el.innerHTML = `
    <div id="distanceChartWrap" class="price-chart-wrap" hidden>
      <h3 class="chart-subtitle" style="margin-top:0">距離の比較(機器の表示・Apple Watch・Fitbit Air)</h3>
      <div class="chart-box short"><canvas id="distanceChart"></canvas></div>
    </div>
    <p class="chart-note">数字は並べて見せているだけで、どちらが正確か、心拍が良い・悪いといった判断はしません。距離の「差」は、トレッドミルなどの表示距離を基準にした差(%)です(表示も絶対に正しい値とは限りません)。</p>
    <div class="workout-list">${sorted.map(workoutCard).join('')}</div>`;
  drawDistanceChart([...sorted].reverse());  // グラフは古い順(左から右へ時間が進む)
}

// ======================== 使い分けの記録(メモ) ========================

function renderNotes(notes) {
  const el = document.getElementById('logArea');
  if (!notes || notes.length === 0) {
    emptyState(el, '使ってみての記録はこれから',
      'スプレッドシートの「装着状況」「条件メモ」に書いた内容を、日付つきのログとしてここに積み重ねていきます。');
    return;
  }
  el.innerHTML = notes.map(n => `<div class="log-entry"><div class="date">${esc(n.date)}</div><div>${esc(n.text)}<div class="log-device">${esc(n.device)}</div></div></div>`).join('');
}

fetch('data/log.json', { cache: 'no-store' })
  .then(r => r.ok ? r.json() : { dailyLogs: [], workoutLogs: [], notes: [] })
  .then(data => {
    renderTrend(data.dailyLogs || []);
    renderWorkouts(data.workoutLogs || []);
    renderNotes(data.notes || []);
    const updated = document.getElementById('lastUpdated');
    if (updated) {
      updated.textContent = data.generatedAt
        ? '最終更新:' + new Date(data.generatedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
        : '最終更新:—(まだ同期されていません)';
    }
  })
  .catch(() => {
    renderTrend([]); renderWorkouts([]); renderNotes([]);
  });
