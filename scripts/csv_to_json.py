"""
Googleスプレッドシートを「ウェブに公開」した際に得られるCSV(2枚)を、
data/log.json の形式に変換するスクリプト。

  日次タブ        : 1行 = 1台の1日分(歩数、運動時間、消費カロリー、睡眠など)
  ワークアウトタブ : 1行 = 1回のワークアウト(Apple Watch / Fitbit Air / 機器の表示を横に並べる)

列名は data/templates/ のCSVを参照。全角のかっこ「（）」で書いても読み取れる。

使い方:
  python3 scripts/csv_to_json.py --daily data/raw_daily.csv --workouts data/raw_workouts.csv --out data/log.json

CSVの形が想定と違う場合(URL間違い・Googleのエラーページなど)は、
出力ファイルを書き換えずにエラーで終了する。
"""
import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone

SAMPLE_MARKER = "サンプルです"  # スプレッドシートのサンプル行を除外するための目印
KNOWN_DEVICES = {"Apple Watch SE3", "Fitbit Air"}
MISSING_TRUE = {"○", "〇", "1", "true", "yes", "はい", "x", "×", "欠測"}


def normalize_header(name):
    """全角かっこ・空白の違いを吸収する(例: '歩数（歩）' → '歩数(歩)')。"""
    name = (name or "").replace("（", "(").replace("）", ")")
    return re.sub(r"\s+", "", name)


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


def is_flagged(value):
    return (value or "").strip().lower() in MISSING_TRUE


def read_rows(path, required, label):
    """CSVを読み、列名をそろえた辞書のリストにする。必要な列がなければエラー終了。"""
    # utf-8-sig: 先頭にBOM(目印の文字)が付いていても読めるようにする
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = [normalize_header(h) for h in (reader.fieldnames or [])]
        missing = [c for c in required if c not in header]
        if missing:
            print(f"エラー: {label}のCSVに必要な列がありません: {', '.join(missing)}")
            print("SHEET_..._CSV_URL が「ウェブに公開」したCSVのURLか、1行目の列名が正しいか確認してください。")
            sys.exit(1)
        rows = []
        for raw in reader:
            row = {normalize_header(k): (v or "").strip() for k, v in raw.items() if k is not None}
            if row.get(required[0]):
                rows.append(row)
    return rows


def has_sample_marker(*values):
    return any(SAMPLE_MARKER in (v or "") for v in values)


def convert_daily(path):
    rows = read_rows(path, ["日付", "デバイス"], "日次")
    logs, notes = [], []
    for r in rows:
        if has_sample_marker(r.get("装着状況")):
            continue
        date, device = normalize_date(r["日付"]), r["デバイス"]
        if device not in KNOWN_DEVICES:
            print(f"注意: 日次 {date} のデバイス名「{device}」は想定外です(想定: {', '.join(sorted(KNOWN_DEVICES))})")
        logs.append({
            "date": date,
            "device": device,
            "steps": to_number(r.get("歩数")),
            "activeMinutes": to_number(r.get("運動時間(分)")),
            "activeCalories": to_number(r.get("アクティブ消費カロリー")),
            "totalCalories": to_number(r.get("総消費カロリー")),
            "sleepHours": to_number(r.get("睡眠時間(時間)")),
            "distanceKm": to_number(r.get("移動距離(km)")),
            "restingHr": to_number(r.get("安静時心拍(bpm)")),
            "wearNote": r.get("装着状況", ""),
            "missing": is_flagged(r.get("欠測")),
        })
        if r.get("装着状況"):
            notes.append({"date": date, "device": device, "text": r["装着状況"]})
    return logs, notes


def device_block(r, prefix):
    return {
        "minutes": to_number(r.get(f"{prefix}時間(分)")),
        "avgHr": to_number(r.get(f"{prefix}平均心拍(bpm)")),
        "maxHr": to_number(r.get(f"{prefix}最大心拍(bpm)")),
        "calories": to_number(r.get(f"{prefix}消費カロリー")),
        "distanceKm": to_number(r.get(f"{prefix}距離(km)")),
    }


def diff_pct(value, base):
    """基準(base)に対する差を%で返す。どちらかが空、または基準が0以下なら None。"""
    if value is None or base is None or base <= 0:
        return None
    return round((value - base) / base * 100, 1)


def convert_workouts(path):
    rows = read_rows(path, ["日付", "種目"], "ワークアウト")
    logs, notes = [], []
    for r in rows:
        if has_sample_marker(r.get("条件メモ")):
            continue
        date = normalize_date(r["日付"])
        apple = device_block(r, "AppleWatch")
        fitbit = device_block(r, "FitbitAir")
        machine = {
            "distanceKm": to_number(r.get("機器表示距離(km)")),
            "calories": to_number(r.get("機器表示消費カロリー")),
            "powerW": to_number(r.get("機器表示出力(W)")),
            "cadenceRpm": to_number(r.get("機器表示ケイデンス(rpm)")),
        }
        # 機器の表示距離を基準にした差(%)。基準になる値がないときは None
        apple["distanceDiffPct"] = diff_pct(apple["distanceKm"], machine["distanceKm"])
        fitbit["distanceDiffPct"] = diff_pct(fitbit["distanceKm"], machine["distanceKm"])
        logs.append({
            "date": date,
            "type": r["種目"],
            "fitbitPlacement": r.get("装着位置(FitbitAir)", ""),
            "note": r.get("条件メモ", ""),
            "apple": apple,
            "fitbit": fitbit,
            "machine": machine,
        })
        if r.get("条件メモ"):
            notes.append({"date": date, "device": r["種目"], "text": r["条件メモ"]})
    return logs, notes


def convert(daily_path, workouts_path, dst_path):
    daily_logs, workout_logs, notes = [], [], []
    if daily_path:
        daily_logs, n = convert_daily(daily_path)
        notes += n
    if workouts_path:
        workout_logs, n = convert_workouts(workouts_path)
        notes += n
    notes.sort(key=lambda x: x["date"])

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dailyLogs": daily_logs,
        "workoutLogs": workout_logs,
        "notes": notes,
    }
    with open(dst_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"変換しました: 日次{len(daily_logs)}件 / ワークアウト{len(workout_logs)}件 / メモ{len(notes)}件")


def main():
    parser = argparse.ArgumentParser(description="スプレッドシートのCSVを data/log.json に変換する")
    parser.add_argument("--daily", help="日次タブのCSV")
    parser.add_argument("--workouts", help="ワークアウトタブのCSV")
    parser.add_argument("--out", required=True, help="出力するJSON")
    args = parser.parse_args()
    if not args.daily and not args.workouts:
        parser.error("--daily か --workouts のどちらかは必要です")
    convert(args.daily, args.workouts, args.out)


if __name__ == "__main__":
    main()
