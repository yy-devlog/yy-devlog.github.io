/**
 * iOSのショートカットから送られた「日次」データを、スプレッドシートの「日次」タブに書き込む
 * Google Apps Script(Googleの無料の小さなプログラム)。
 *
 * 使い方: docs/ios-shortcut-guide.md を参照。
 *
 * - 同じ「日付 + デバイス」の行があれば、送られた項目だけを上書きする(なければ1行追加する)。
 *   だから、同じ日を何回送っても重複しない。手で入れた「装着状況」「欠測」などの列は消えない。
 * - 合言葉(TOKEN)は、このファイルには書かない。GitHubは公開リポジトリなので、
 *   Apps Scriptの「スクリプト プロパティ」に TOKEN という名前で保存する(手順書を参照)。
 */

const SHEET_NAME = '日次';
const DEVICES = ['Apple Watch SE3', 'Fitbit Air'];
// 送られてくる項目名 → スプレッドシートの列名
const FIELDS = {
  steps: '歩数',
  activeMinutes: '運動時間(分)',
  activeCalories: 'アクティブ消費カロリー',
  totalCalories: '総消費カロリー',
  sleepHours: '睡眠時間(時間)',
  distanceKm: '移動距離(km)',
  restingHr: '安静時心拍(bpm)',
};

// Webアプリを開いたときの応答。データは何も返さない(URLだけでは中身が見えないようにする)
function doGet() {
  return json_({ ok: true, message: 'ready' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || body.token !== token) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    return json_(upsertDaily_(body, SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* ロックを取れていない場合は何もしない */ }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 全角かっこ・空白の違いを吸収する(例: '歩数（歩）' → '歩数(歩)')
function normalizeHeader_(name) {
  return String(name || '').replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
}

// セルの値(Date または文字列)を 'YYYY-MM-DD' にそろえる
function toDateString_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : String(v || '').trim();
}

function upsertDaily_(body, sheet) {
  if (!sheet) return { ok: false, error: 'sheet not found: ' + SHEET_NAME };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) return { ok: false, error: 'date must be YYYY-MM-DD' };
  if (DEVICES.indexOf(body.device) === -1) return { ok: false, error: 'unknown device' };

  // 数値として読める項目だけを取り出す(空・文字・null は無視する)
  const values = {};
  Object.keys(FIELDS).forEach(function (key) {
    const raw = body[key];
    if (raw === null || raw === undefined || raw === '') return;
    const n = Number(raw);
    if (isFinite(n)) values[key] = n;
  });
  if (Object.keys(values).length === 0) return { ok: false, error: 'no numeric fields' };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizeHeader_);
  const dateCol = headers.indexOf('日付');
  const deviceCol = headers.indexOf('デバイス');
  if (dateCol < 0 || deviceCol < 0) return { ok: false, error: 'header not found: 日付/デバイス' };

  const colOf = {};
  const ignored = [];
  Object.keys(values).forEach(function (key) {
    const idx = headers.indexOf(normalizeHeader_(FIELDS[key]));
    if (idx < 0) ignored.push(key); else colOf[key] = idx;
  });

  // 同じ「日付 + デバイス」の行を探す
  const lastRow = sheet.getLastRow();
  let row = -1;
  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < data.length; i++) {
      if (toDateString_(data[i][dateCol]) === body.date && String(data[i][deviceCol]).trim() === body.device) {
        row = i + 2;
        break;
      }
    }
  }

  let action = 'updated';
  if (row < 0) {
    action = 'appended';
    row = lastRow + 1;
    sheet.getRange(row, dateCol + 1).setNumberFormat('yyyy-mm-dd').setValue(body.date);
    sheet.getRange(row, deviceCol + 1).setValue(body.device);
  }
  Object.keys(colOf).forEach(function (key) {
    sheet.getRange(row, colOf[key] + 1).setValue(values[key]);
  });
  return { ok: true, action: action, row: row, ignoredFields: ignored };
}
