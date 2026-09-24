# ウェアラブル実測ログ(サイト名は未定・仮の表示は「yy-devlog」)

ウェアラブル機器とイヤホンを、実際に使って測った数値で紹介する個人メディア(GitHub Pages)です。
最初の企画は「Apple Watch SE 3 と Fitbit Air の併用」。結論を先に書き、実測記事で確かめていきます。
要件は [CLAUDE.md](CLAUDE.md) にまとめてあります。

- サイトURL: `https://yy-devlog.github.io/`
- リポジトリ名: `yy-devlog.github.io`(この名前にすると、URLの後ろにリポジトリ名が付かない)
- サイト名を決めたら、`scripts/build_site.py` の `SITE_NAME` を書き換えるだけで全ページに反映される

## フォルダ構成

```
index.html                               トップ(記事一覧)
about.html / privacy.html                このサイトについて・プライバシーポリシー
compare.html                             実測データの比較ページ(記録が始まるまで非公開。DRAFT_PAGES で制御)
data/templates/, data/sample/            シートの列名の雛形 / 手元確認用の架空データ(公開されない)
scripts/gas/, docs/                      iPhoneのショートカットからシートへ自動入力する受け口(Apps Script)と、その手順書
assets/                                  style.css, app.js(グラフ描画)
data/log.json                            記録データ(スプレッドシートから自動生成される)
articles/                                記事(Markdown)を置く場所
templates/base.html                      記事ページ共通の枠(ナビ・フッター)
scripts/csv_to_json.py                   スプレッドシートのCSV(2枚) → data/log.json
scripts/build_site.py                    記事のHTML化 + サイト全体を _site/ に組み立てる
.github/workflows/sync-sheet.yml         毎週月曜の自動実行(データ取得 → ビルド → 公開)
```

`_site/` は自動で作られる完成品のフォルダで、Git には入れません(`.gitignore` 済み)。

## 記事の書き方

1. `articles/_template.md` をコピーして、`articles/2026-10-好きな名前.md` のような名前で保存する
   (ファイル名は半角の小文字英数字とハイフンだけ。ファイル名がそのまま記事のURLになる)
2. 先頭の設定(タイトル・日付・説明文・タグ)と本文を書く
3. `draft: true` の間は公開されない。公開してよくなったら `draft: true` の行を消す
4. GitHub に push すると、自動でHTML化されて公開される

画像は `assets/img/` に置き、記事の中では `![説明]({{root}}assets/img/ファイル名.jpg)` と書きます。

### 手元で確認する

```
pip install -r scripts/requirements.txt          # 初回のみ
python3 scripts/build_site.py --drafts           # 下書きも含めて _site/ を作る
python3 -m http.server -d _site 8000             # http://localhost:8000/ で確認(止めるときは Ctrl+C)
```

## セットアップ手順

### 1. GitHubリポジトリの作成
1. GitHubで新しいリポジトリ `yy-devlog.github.io` を作成(Public。READMEやライセンスの自動追加はオフ)
2. このフォルダの中身をすべてそのリポジトリに push する
   (メールアドレスは、GitHubの `xxxx+ユーザー名@users.noreply.github.com` を使う設定にしてある)

### 2. GitHub Pagesを有効化
1. リポジトリの **Settings > Pages** を開く
2. Source を **GitHub Actions** に設定する(Branchデプロイではなく、こちらを選ぶ)

### 3. Googleスプレッドシートを作る(日次タブ・ワークアウトタブの2枚)
1. Googleスプレッドシートを新しく作り、タブを2枚にする(名前は「日次」「ワークアウト」)
2. それぞれのタブの1行目に、列名を入れる。`data/templates/` の2つのCSV(1行目だけのファイル)を
   「ファイル > インポート」で読み込むと、列名をそろえられる
   - `data/templates/daily_template.csv` → 「日次」タブ
   - `data/templates/workouts_template.csv` → 「ワークアウト」タブ
3. **ファイル > 共有 > ウェブに公開** で、**タブごとに**(「特定のシート」を選ぶ)、形式を **カンマ区切りの値(.csv)** にして公開する
4. 発行されたURL(`https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&output=csv` の形)を、2枚分コピーする

   ※ このシートはURLを知っていれば誰でも閲覧できる状態になります。また、シートの内容はサイトに表示され、
   公開リポジトリからも見える形になります。公開して問題ないデータだけを書く「公開用シート」にしてください
   (家族の名前・場所など、個人が特定される内容は、装着状況や条件メモにも書かない)。

### 4. コピーしたURLをGitHubに設定
1. リポジトリの **Settings > Secrets and variables > Actions > Variables** タブを開く
2. **New repository variable** で、次の2つを追加する
   - Name: `SHEET_DAILY_CSV_URL` / Value: 「日次」タブのURL
   - Name: `SHEET_WORKOUTS_CSV_URL` / Value: 「ワークアウト」タブのURL

未設定の間は、リポジトリ内の `data/log.json`(現在は空)がそのまま使われます。どちらか片方だけの設定は、エラーで止まります。

### 5. 初回の公開
1. `main` ブランチに push すると、自動で公開される
2. うまくいかないときは、リポジトリの **Actions** タブ → `Sync data, build and deploy` を開き、失敗した手順のログを見る
3. 手動で実行したいときは、同じ画面の **Run workflow** を押す

これ以降は、push したときと、**毎週月曜の日本時間6:00頃**に自動で更新されます(日曜の夜までにシートへ入力しておく)。
スプレッドシートのURLが間違っている・列名が想定と違う場合は、エラーで止まり、古い状態のサイトがそのまま残ります(空データで上書きされません)。

## スプレッドシートの列構成

「必須」は、比較の中心になる項目です。それ以外は、分かる範囲で入力すれば足ります。空欄でも構いません。

### 「日次」タブ(1行 = 1台の1日分。1日に2行)

| 列名 | 内容 |
|---|---|
| 日付 | YYYY-MM-DD(`2026/10/1` のような形でも自動で直る)。必須 |
| デバイス | `Apple Watch SE3` または `Fitbit Air`。必須 |
| 歩数 | 数値(`8,234` のようなカンマ付きも可)。必須 |
| 運動時間(分) | 機器ごとの定義のまま入力する(Apple の「運動」、Fitbit の「アクティブな時間」など)。必須 |
| アクティブ消費カロリー | 動いた分の消費カロリー。総消費と、どちらか分かる方を必須 |
| 総消費カロリー | 安静時を含む1日の消費カロリー |
| 睡眠時間(時間) | 2台とも着けて寝た夜だけ。必須 |
| 移動距離(km) | 任意 |
| 安静時心拍(bpm) | 任意 |
| 装着状況 | 「Air: 足首(日中)/手首(就寝)」「SE 3: 充電で2時間外した」など。数字に影響しそうなこと |
| 欠測 | 充電や付け忘れで、1日の大半が測れていない日に `○` を入れる(グラフから除かれる) |

### 「ワークアウト」タブ(1行 = 1回のワークアウト。2台と機器の表示を横に並べる)

| 列名 | 内容 |
|---|---|
| 日付、種目 | 種目は、ランニング(トレッドミル)、インドアサイクリング、バスケットボールなど |
| 装着位置(Fitbit Air) | 足首 / 手首 |
| 条件メモ | トレッドミルの速度・傾斜、バイクの負荷の設定など |
| Apple Watch 時間(分)、平均心拍(bpm)、最大心拍(bpm)、消費カロリー、距離(km) | 数値 |
| Fitbit Air 時間(分)、平均心拍(bpm)、最大心拍(bpm)、消費カロリー、距離(km) | 数値 |
| 機器表示 距離(km)、消費カロリー、出力(W)、ケイデンス(rpm) | トレッドミルやバイクの表示。ある種目だけ入力する |

- 距離は、機器表示 距離(km) を基準にした差(%)が、自動で計算されます。
- 心拍やカロリーは、数字を並べて見せるだけで、良し悪しの判断はしません。

### 手元でグラフの見た目を確認する(架空のサンプルデータ)
```
python3 scripts/build_site.py --drafts --sample-data
python3 -m http.server -d _site 8000     # http://localhost:8000/compare.html
```
`data/sample/` の架空のデータに差し替えて表示します。**このデータは公開されません**(`_site/` の中だけで使われ、`data/log.json` は変わりません)。

## 記入が必要な箇所(運営者が後で自分で記入する)

- `about.html` … 運営者の表示名・紹介文、お問い合わせフォームのURL。ファイル内にコメントで印をつけてある
- `privacy.html` … 制定日。Cookieの記載も、公開後に確認する
- `articles/se3-air-conclusion.md` … 記事1本目(下書き)。価格を公式サイトで再確認して、`draft: true` を消すと公開される

未記入の欄やTODOが公開ページに残っていると、ビルド時に「注意: …」と表示されます(止まりはしません)。公開前にこの表示が出ていないことを確認してください。

## アフィリエイト(Amazonアソシエイト)について

現在は広告・アフィリエイトを載せていません。アクセスと記事が増えてから、申請を検討します。始めるときは次を更新します。

- `about.html` に「広告について」の節を書く(Amazonアソシエイトの定型文もここに入れる。ファイル内にコメントあり)
- `privacy.html` の「アクセス解析・広告」の節を書き換える
- 広告であることが分かる表記を、ページ上部などに足す(`templates/base.html`)
- 記事内に、実際のアフィリエイトリンクを入れる

## 独自ドメインを使う場合

- このフォルダのルートに `CNAME` ファイル(中身はドメイン名のみ)を追加する
- Actions の Variables に `SITE_URL`(例: `https://example.com`)を追加する
  (`scripts/build_site.py` の `SITE_URL` の初期値を書き換えてもよい)
