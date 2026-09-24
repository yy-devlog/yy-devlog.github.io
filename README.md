# Apple Watch SE3 × Fitbit Air 比較ログ

Apple Watch SE3 と Fitbit Air を併用(日中は足首、就寝時は手首)して比較する、GitHub Pages 用のサイトです。
実測データのグラフと、記事(ブログ)の両方を載せられます。
記録が始まっていない間、グラフ部分は「まだ記録がありません」という空の状態で表示されます。

- 想定するサイトURL: `https://yy-devlog.github.io/wearable-duo-log/`
- 想定するリポジトリ名: `wearable-duo-log`

## フォルダ構成

```
index.html / about.html / privacy.html   トップ・運営者情報・プライバシーポリシー
assets/                                  style.css, app.js(グラフ描画)
data/log.json                            記録データ(スプレッドシートから自動生成される)
articles/                                記事(Markdown)を置く場所
templates/base.html                      記事ページ共通の枠(ナビ・広告表記・フッター)
scripts/csv_to_json.py                   スプレッドシートのCSV → data/log.json
scripts/build_site.py                    記事のHTML化 + サイト全体を _site/ に組み立てる
.github/workflows/sync-sheet.yml         毎日の自動実行(データ取得 → ビルド → 公開)
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
1. GitHubで新しいリポジトリ `wearable-duo-log` を作成(Public。READMEやライセンスの自動追加はオフ)
2. このフォルダの中身をすべてそのリポジトリに push する
   (メールアドレスは、GitHubの `xxxx+ユーザー名@users.noreply.github.com` を使う設定にしてある)

### 2. GitHub Pagesを有効化
1. リポジトリの **Settings > Pages** を開く
2. Source を **GitHub Actions** に設定する(Branchデプロイではなく、こちらを選ぶ)

### 3. Googleスプレッドシートを「ウェブに公開」
1. 記録用スプレッドシートを開く
2. **ファイル > 共有 > ウェブに公開**
3. 公開する範囲を「特定のシート」、形式を **カンマ区切りの値(.csv)** に設定して公開
4. 発行されたURL(`https://docs.google.com/spreadsheets/d/e/.../pub?output=csv` の形)をコピー

   ※ このシートはURLを知っていれば誰でも閲覧できる状態になります。また、シートの内容はサイトに表示され、
   公開リポジトリからも見える形になります。公開して問題ないデータだけを書く「公開用シート」にしてください
   (家族の名前・場所など、個人が特定される内容はメモ欄にも書かない)。

### 4. コピーしたURLをGitHubに設定
1. リポジトリの **Settings > Secrets and variables > Actions > Variables** タブを開く
2. **New repository variable** で
   - Name: `SHEET_CSV_URL`
   - Value: 手順3でコピーしたURL
   を追加

未設定の間は、リポジトリ内の `data/log.json`(現在は空)がそのまま使われます。

### 5. 初回の公開
1. `main` ブランチに push すると、自動で公開される
2. うまくいかないときは、リポジトリの **Actions** タブ → `Sync data, build and deploy` を開き、失敗した手順のログを見る
3. 手動で実行したいときは、同じ画面の **Run workflow** を押す

これ以降は、push したときと、毎日 日本時間6:00頃に自動で更新されます。
スプレッドシートのURLが間違っている・列名が想定と違う場合は、エラーで止まり、古い状態のサイトがそのまま残ります(空データで上書きされません)。

## スプレッドシートの列構成

| 列名 | 内容 |
|---|---|
| 日付 | YYYY-MM-DD(`2026/10/1` のような形でも自動で直る) |
| デバイス | `Apple Watch SE3` または `Fitbit Air` |
| 歩数 | 数値(`8,234` のようなカンマ付きも可) |
| アクティビティ時間(分) | 数値 |
| 消費カロリー | 数値 |
| ワークアウト種類 | 文字列(空欄可) |
| ワークアウト時間(分) | 数値(空欄可) |
| 平均心拍数 | 数値(空欄可) |
| 睡眠時間(時間) | 数値(空欄可・Fitbit Airのみ) |
| メモ | 自由記述(「使い分けの記録」欄に表示される) |

## 記入が必要な箇所(運営者が後で自分で記入する)

- `about.html` … 氏名・連絡先(運営者情報)。ファイル内にコメントで印をつけてある
- `privacy.html` … Cookie/アクセス解析の利用有無、制定日。同じくコメントあり
- `articles/2026-10-price-se3-air.md` … サンプル記事(下書き)。価格を公式サイトで再確認して、`draft: true` を消すと公開される

## Amazonアソシエイト申請について

- 申請前に、記事(補助コンテンツ)をいくつか追加しておくことを推奨します(スペック比較1本だけでは弱いことが多いです)
- 審査通過後、`index.html` / `about.html` 内の `href="#"` になっているリンクを、実際のアフィリエイトリンクに差し替えてください
- 審査通過後、`about.html` の広告表記を「参加者です」の文に差し替える(該当箇所にコメントあり)。`index.html` のバナー・フッター、`templates/base.html` のバナー・フッターの「予定です」の表記も更新する
- 独自ドメインを使う場合は、このフォルダのルートに `CNAME` ファイル(中身はドメイン名のみ)を追加し、
  Actions の環境変数 `SITE_URL` にそのドメイン(`https://example.com`)を設定してください。
  `scripts/build_site.py` の `SITE_URL` の初期値も、その時点で書き換えると分かりやすいです。
