"""
サイト全体を _site/ フォルダに組み立てるスクリプト。

やること:
  1. articles/*.md(Markdown形式の記事)を、HTMLの記事ページに変換する
  2. 記事一覧ページ(articles/index.html)と、トップページの「新着記事」を作る
  3. index.html / about.html / privacy.html / assets / data/log.json を _site/ にコピーする
     (compare.html は実測データの公開準備ができるまで、--drafts のときだけ含める)
  4. sitemap.xml(検索エンジン向けのページ一覧)、robots.txt、404.html を作る

使い方:
  pip install -r scripts/requirements.txt
  python3 scripts/build_site.py            # 公開用(draft: true の記事は含めない)
  python3 scripts/build_site.py --drafts   # 手元の確認用(下書きも含める)
  python3 scripts/build_site.py --drafts --sample-data   # 架空のサンプルデータでグラフの見た目を確認する(公開しない)

  確認するとき: python3 -m http.server -d _site 8000  →  http://localhost:8000/

サイトのURL・サイト名は、環境変数 SITE_URL / SITE_NAME / SITE_TAGLINE で変えられる。
  例: SITE_URL=https://example.com SITE_NAME=ソクログ python3 scripts/build_site.py
"""
import html
import json
import os
import re
import shutil
import sys
from datetime import date
from pathlib import Path

try:
    import markdown
except ImportError:
    print("エラー: markdown ライブラリがありません。 pip install -r scripts/requirements.txt を実行してください。")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import csv_to_json  # 同じフォルダの変換スクリプト
OUT = ROOT / "_site"
SITE_URL = (os.environ.get("SITE_URL") or "https://yy-devlog.github.io").rstrip("/")
# サイト名は未定。決まったら、ここ(または環境変数)を書き換えるだけで全ページに反映される。
SITE_NAME = os.environ.get("SITE_NAME") or "yy-devlog"
SITE_TAGLINE = os.environ.get("SITE_TAGLINE") or "ウェアラブルとイヤホンの実測記録"
# 公開準備ができるまで、--drafts のときだけ出力するページ
DRAFT_PAGES = {"compare.html"}

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
ARTICLE_NOTICE = "※ 価格・仕様は記事に書いた時点の情報です。購入前に公式サイト等で最新の情報をご確認ください。"


def fail(message):
    print("エラー: " + message)
    sys.exit(1)


def esc(value):
    return html.escape(str(value), quote=True)


def render(template, **values):
    values = dict(values, site_name=esc(SITE_NAME), tagline=esc(SITE_TAGLINE))
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    return template


def parse_article(path):
    """記事ファイルの先頭の設定部分(front matter)と本文を分けて読む。"""
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        fail(f"{path.name}: 先頭に --- で囲んだ設定(title, date, description)が必要です。")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.lstrip().startswith("#"):
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"').strip("'")
    slug = path.stem
    if not SLUG_PATTERN.match(slug):
        fail(f"{path.name}: ファイル名は半角の小文字英数字とハイフンだけにしてください(例: 2026-10-price-se3-air.md)。")
    for key in ("title", "date", "description"):
        if not meta.get(key):
            fail(f"{path.name}: 設定に {key} がありません。")
    for key in ("date", "updated"):
        if meta.get(key):
            try:
                date.fromisoformat(meta[key])
            except ValueError:
                fail(f"{path.name}: {key} は YYYY-MM-DD の形で書いてください(例: 2026-10-05)。")
    return {
        "slug": slug,
        "title": meta["title"],
        "date": meta["date"],
        "updated": meta.get("updated", ""),
        "description": meta["description"],
        "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
        "draft": meta.get("draft", "false").lower() == "true",
        "body": m.group(2),
    }


def markdown_to_html(body, root):
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)  # 執筆メモ(HTMLコメント)は公開しない
    body = body.replace("{{root}}", root)
    md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists"])
    return md.convert(body)


def article_list_html(articles, root):
    items = []
    for a in articles:
        label = "【下書き】" if a["draft"] else ""
        items.append(
            f'<li><span class="date">{esc(a["date"])}</span><br>'
            f'<a class="title" href="{root}articles/{a["slug"]}/">{label}{esc(a["title"])}</a>'
            f'<p>{esc(a["description"])}</p></li>'
        )
    return '<ul class="article-list">\n' + "\n".join(items) + "\n</ul>"


def empty_articles_html():
    return '<div class="empty-state"><strong>記事は準備中です</strong>実測ベースの比較記事を、順次公開していきます。</div>'


def copy_page(name, latest_html):
    """静的ページをコピーしつつ、%SITE_URL% と新着記事の目印を置き換える。"""
    text = (ROOT / name).read_text(encoding="utf-8")
    text = text.replace("%SITE_URL%", SITE_URL).replace("%SITE_NAME%", esc(SITE_NAME)).replace("%SITE_TAGLINE%", esc(SITE_TAGLINE))
    text = re.sub(r"<!-- LATEST_ARTICLES:.*?-->", lambda _: latest_html, text, flags=re.S)
    (OUT / name).write_text(text, encoding="utf-8")


def main():
    include_drafts = "--drafts" in sys.argv

    base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")

    # ---- 記事を読み込む ----
    articles = []
    for path in sorted((ROOT / "articles").glob("*.md")):
        if path.stem.startswith("_"):  # _template.md のような雛形は対象外
            continue
        a = parse_article(path)
        if a["draft"] and not include_drafts:
            continue
        articles.append(a)
    articles.sort(key=lambda a: (a["date"], a["slug"]), reverse=True)

    # ---- 出力フォルダを作り直す(_site は毎回作り直す生成物) ----
    if OUT.exists():
        assert OUT.name == "_site"
        shutil.rmtree(OUT)
    OUT.mkdir()

    # ---- 静的ページ・素材のコピー ----
    latest = article_list_html(articles, "") if articles else empty_articles_html()
    pages = ["index.html", "about.html", "privacy.html"]
    pages += sorted(DRAFT_PAGES) if include_drafts else []
    for name in pages:
        copy_page(name, latest)
    shutil.copytree(ROOT / "assets", OUT / "assets")
    (OUT / "data").mkdir()
    shutil.copy(ROOT / "data" / "log.json", OUT / "data" / "log.json")
    if "--sample-data" in sys.argv:
        # 手元の確認用: 架空のサンプルデータに差し替える(_site/ の中だけ。data/log.json は変えない)
        csv_to_json.convert(str(ROOT / "data/sample/daily.csv"), str(ROOT / "data/sample/workouts.csv"),
                            str(OUT / "data" / "log.json"))
        print("注意: 架空のサンプルデータを使っています。このまま公開しないでください。")

    # ---- 記事ページ ----
    for a in articles:
        root = "../../"
        canonical = f"{SITE_URL}/articles/{a['slug']}/"
        tags = ""
        if a["tags"]:
            tags = '<ul class="tag-list">' + "".join(f"<li>{esc(t)}</li>" for t in a["tags"]) + "</ul>\n"
        dates = f'{esc(a["date"])} 公開' + (f'(更新 {esc(a["updated"])})' if a["updated"] else "")
        content = (
            '<main class="article">\n'
            f'<p class="meta">{dates}</p>\n'
            f'<h1>{esc(a["title"])}</h1>\n'
            f"{tags}"
            f'<p class="notice">{ARTICLE_NOTICE}</p>\n'
            f'{markdown_to_html(a["body"], root)}\n'
            "</main>\n"
        )
        ld = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": a["title"],
            "description": a["description"],
            "datePublished": a["date"],
            "dateModified": a["updated"] or a["date"],
            "mainEntityOfPage": canonical,
        }
        extra_head = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False).replace("<", "\\u003c") + "</script>\n"
        page = render(
            base,
            title=esc(a["title"]) + " | " + esc(SITE_NAME),
            description=esc(a["description"]),
            canonical=canonical,
            og_type="article",
            robots='<meta name="robots" content="noindex">\n' if a["draft"] else "",
            root=root,
            extra_head=extra_head,
            content=content,
        )
        out_dir = OUT / "articles" / a["slug"]
        out_dir.mkdir(parents=True)
        (out_dir / "index.html").write_text(page, encoding="utf-8")

    # ---- 記事一覧ページ ----
    listing = article_list_html(articles, "../") if articles else empty_articles_html()
    content = (
        '<main class="page-head">\n<h1>記事</h1>\n'
        "<p>実測ベースの比較や、使い方の記録。</p>\n</main>\n"
        f"{listing}\n"
    )
    page = render(
        base,
        title="記事一覧 | " + esc(SITE_NAME),
        description=esc(SITE_TAGLINE + "の記事一覧。"),
        canonical=f"{SITE_URL}/articles/",
        og_type="website",
        robots="",
        root="../",
        extra_head="",
        content=content,
    )
    (OUT / "articles").mkdir(exist_ok=True)
    (OUT / "articles" / "index.html").write_text(page, encoding="utf-8")

    # ---- 404ページ(どの深さのURLでも崩れないよう、リンクは絶対URLにする) ----
    content = (
        '<main class="page-head">\n<h1>ページが見つかりません</h1>\n'
        f'<p>URLが間違っているか、ページが移動した可能性があります。<a href="{SITE_URL}/">トップページへ戻る</a></p>\n</main>\n'
    )
    page = render(
        base,
        title="ページが見つかりません | " + esc(SITE_NAME),
        description="お探しのページは見つかりませんでした。",
        canonical=f"{SITE_URL}/404.html",
        og_type="website",
        robots='<meta name="robots" content="noindex">\n',
        root=SITE_URL + "/",
        extra_head="",
        content=content,
    )
    (OUT / "404.html").write_text(page, encoding="utf-8")

    # ---- sitemap.xml / robots.txt ----
    urls = [(f"{SITE_URL}/", None), (f"{SITE_URL}/articles/", None)]
    urls += [(f"{SITE_URL}/{name}", None) for name in pages if name not in DRAFT_PAGES and name != "index.html"]
    urls += [(f"{SITE_URL}/articles/{a['slug']}/", a["updated"] or a["date"]) for a in articles if not a["draft"]]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        lines.append("  <url><loc>" + esc(loc) + "</loc>" + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "") + "</url>")
    lines.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n", encoding="utf-8")

    # 未記入の目印(【ここに…】【YYYY…】【Googleフォーム…】)や TODO が公開ページに残っていないか知らせる(止めはしない)
    leftovers = []
    for f in sorted(OUT.rglob("*.html")):
        body = re.sub(r"<!--.*?-->", "", f.read_text(encoding="utf-8"), flags=re.S)
        if re.search(r"【(?:ここに|YYYY|Googleフォーム)|TODO", body):
            leftovers.append(str(f.relative_to(OUT)))
    if leftovers:
        print("注意: 未記入の欄や TODO が残っているページがあります(公開前に確認してください): " + ", ".join(leftovers))

    mode = "(下書きを含む)" if include_drafts else ""
    print(f"_site/ を作りました{mode}: 記事{len(articles)}本 / サイトURL {SITE_URL}")


if __name__ == "__main__":
    main()
