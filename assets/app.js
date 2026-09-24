// data/log.json は .github/workflows/sync-sheet.yml が
// Googleスプレッドシートから自動生成するファイル。
// 手元でまだ実行していない場合、または記録がまだない場合は
// 空の状態(empty state)がそのまま表示される。

const dim = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#9CA6B4';
const line = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#2B313B';
Chart.defaults.color = dim;
Chart.defaults.borderColor = line;
Chart.defaults.font.family = "Inter, system-ui, sans-serif";

// ---- 静的な価格比較(公式発表ベース。ここは手動更新でOK) ----
// 「〜から」の最低価格の構成。2026年9月時点のApple公式サイト・Googleストアの表記。
// TODO(公開前に確認): SE 3(41,800円から)とFitbit Air(16,800円)は要再確認。
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
      backgroundColor: ['#8FA8C7', '#3E4652', '#3E4652'],
      borderRadius: 3,
      barThickness: 36
    }]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
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

function renderTrend(dailyLogs) {
  const el = document.getElementById('trendArea');
  if (!dailyLogs || dailyLogs.length === 0) {
    emptyState(el, 'まだ記録がありません',
      'スプレッドシートに歩数・アクティビティ時間を入力し、Actionsを実行(または翌日の自動実行を待つ)すると、ここに折れ線グラフで表示されます。');
    return;
  }
  const dates = [...new Set(dailyLogs.map(d => d.date))].sort();
  const byDevice = (device, key) => dates.map(date => {
    const row = dailyLogs.find(d => d.date === date && d.device === device);
    return row ? row[key] : null;
  });
  el.innerHTML = '<canvas id="trendChart" height="110"></canvas>';
  new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: 'Apple Watch SE3 歩数', data: byDevice('Apple Watch SE3', 'steps'), borderColor: '#8FA8C7', tension: 0.3, spanGaps: true },
        { label: 'Fitbit Air 歩数', data: byDevice('Fitbit Air', 'steps'), borderColor: '#B98BD9', tension: 0.3, spanGaps: true }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { grid: { color: line } }, x: { grid: { display: false } } } }
  });
}

function renderWorkouts(workoutLogs) {
  const el = document.getElementById('workoutArea');
  if (!workoutLogs || workoutLogs.length === 0) {
    emptyState(el, 'ワークアウトの記録はまだありません',
      '同じワークアウトを両デバイスで計測したら、種類・時間・平均心拍数を比較表として表示します。');
    return;
  }
  const rows = workoutLogs.map(w => `
    <tr>
      <td>${esc(w.date)}</td><td>${esc(w.type)}</td><td>${esc(w.device)}</td>
      <td>${esc(w.minutes ?? '—')}分</td><td>${esc(w.avgHr ?? '—')}bpm</td>
    </tr>`).join('');
  el.innerHTML = `
    <div class="table-scroll">
      <table class="compare-table">
        <thead><tr><th>日付</th><th>種目</th><th>デバイス</th><th>時間</th><th>平均心拍</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderNotes(notes) {
  const el = document.getElementById('logArea');
  if (!notes || notes.length === 0) {
    emptyState(el, '使ってみての記録はこれから',
      'スプレッドシートのメモ欄に書いた内容を、日付つきのログとしてここに積み重ねていきます。');
    return;
  }
  el.innerHTML = notes.map(n => `<div class="log-entry"><div class="date">${esc(n.date)}</div><div>${esc(n.text)}</div></div>`).join('');
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
