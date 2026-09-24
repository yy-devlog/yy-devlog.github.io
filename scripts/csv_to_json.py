"""
Googleスプレッドシートを「ウェブに公開」した際に得られるCSVを
data/log.json の形式に変換するスクリプト。

想定する列(1行目はヘッダー):
日付, デバイス, 歩数, アクティビティ時間(分), 消費カロリー,
ワークアウト種類, ワークアウト時間(分), 平均心拍数, 睡眠時間(時間), メモ

使い方:
  python3 scripts/csv_to_json.py data/raw.csv data/log.json

CSVの形が想定と違う場合(URL間違い・Googleのエラーページなど)は、
data/log.json を書き換えずにエラーで終了する。
"""
import csv
import json
import re
import sys
from datetime import datetime, timezone

SAMPLE_MARKER = "サンプルです"  # スプレッドシートのサンプル行を除外するための目印
REQUIRED_COLUMNS = ["日付", "デバイス"]


def to_number(value):
    """'1,234' や '72.5' を数値にする。空欄・変換できない値は None。"""
    value = (value or "").strip().replace(",", "").replace("、", "")
    if value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def normalize_date(value):
    """'2026/10/1' や '2026-10-1' を 'YYYY-MM-DD' にそろえる。読めなければそのまま返す。"""
    value = (value or "").strip()
    m = re.match(r"^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$", value)
    if not m:
        return value
    year, month, day = (int(g) for g in m.groups())
    return f"{year:04d}-{month:02d}-{day:02d}"


def main(src_path, dst_path):
    # utf-8-sig: 先頭にBOM(目印の文字)が付いていても読めるようにする
    with open(src_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        missing = [c for c in REQUIRED_COLUMNS if c not in header]
        if missing:
            print(f"エラー: CSVに必要な列がありません: {', '.join(missing)}")
            print("SHEET_CSV_URL が「ウェブに公開」したCSVのURLか、1行目の列名が正しいか確認してください。")
            sys.exit(1)
        rows = [r for r in reader if (r.get("日付") or "").strip()]

    # サンプル行を除外
    rows = [r for r in rows if SAMPLE_MARKER not in (r.get("メモ") or "")]

    daily_logs = []
    workout_logs = []
    notes = []

    for r in rows:
        date = normalize_date(r.get("日付"))
        device = (r.get("デバイス") or "").strip()

        daily_logs.append({
            "date": date,
            "device": device,
            "steps": to_number(r.get("歩数")),
            "activeMinutes": to_number(r.get("アクティビティ時間(分)")),
            "calories": to_number(r.get("消費カロリー")),
            "sleepHours": to_number(r.get("睡眠時間(時間)")),
        })

        workout_type = (r.get("ワークアウト種類") or "").strip()
        if workout_type:
            workout_logs.append({
                "date": date,
                "device": device,
                "type": workout_type,
                "minutes": to_number(r.get("ワークアウト時間(分)")),
                "avgHr": to_number(r.get("平均心拍数")),
            })

        memo = (r.get("メモ") or "").strip()
        if memo:
            notes.append({"date": date, "device": device, "text": memo})

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dailyLogs": daily_logs,
        "workoutLogs": workout_logs,
        "notes": notes,
    }

    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"変換しました: 日次{len(daily_logs)}件 / ワークアウト{len(workout_logs)}件 / メモ{len(notes)}件")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 csv_to_json.py <input.csv> <output.json>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
