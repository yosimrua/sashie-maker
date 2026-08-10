# 開発用README (挿絵メーカー - 開発ディレクトリ)

本ディレクトリは、「挿絵メーカー」のNext.js (React) によるフロントエンドアプリケーション開発用ソースコードです。

---

## 🚀 開発環境のセットアップと起動

依存関係のインストールを行い、開発サーバーを起動します。

```bash
# 依存パッケージのインストール
npm install

# 開発用ローカルサーバー起動 (localhost:3000)
npm run dev

# プロダクションビルド・型チェック
npm run build
```

---

## 📂 ディレクトリ構造・主要ファイル解説

```text
src/
├── app/
│   ├── layout.tsx     # 共通レイアウト定義
│   ├── page.tsx       # アプリケーションのメイン画面 (SPA) と状態管理ロジック
│   └── globals.css    # グローバルスタイル (Vanilla CSSによるダークテーマ設計)
└── lib/
    ├── db.ts          # IndexedDB (Dexie.js) のデータベース定義とスキーマ設計
    └── ai.ts          # Gemini API / NanobananaPro API との通信インターフェース
```

### 1. `src/app/page.tsx` (メインUI・コントローラー)
* アプリケーションの単一画面 (SPA) の状態制御を担います。
* 「👤 キャラクター管理」「🎬 シーン・挿絵生成」のタブ表示切り替え。
* ヘッダーのプルダウンから編集対象の「📚 小説」を切り替えることで、表示されるキャラ・シーン情報が連動してIndexedDBから抽出・フィルターされます。
* 初回起動時に、既存の未紐付けデータを小説「AI事務員宮西さん」に自動で結びつけるマイグレーション処理もここに組み込まれています。

### 2. `src/lib/db.ts` (IndexedDB / データベース定義)
* **Dexie.js** を用いたクライアント側の永続化レイア。
* **主要テーブル構成**:
  * `novels`: 小説プロジェクト情報 (ID, タイトル, あらすじなど)
  * `characters`: キャラクター情報 (関連小説ID, 名前, ポーズ画像群 `input`/`front`/`side`, 外見特徴MD, プロフィールMD)
  * `scenes`: 挿絵生成シーン (関連小説ID, シーン名, 本文, 登場キャラID群, シーン設定MD)
  * `generatedImages`: シーンに紐づいて保存された生成画像データ (Base64) の履歴管理

### 3. `src/lib/ai.ts` (AI・API連携)
* Google AI Studio経由のAPI（Gemini API、および画像生成用のNanobananaPro API）との通信ロジックを統合しています。
* **主要メソッド**:
  * `analyzeCharacterVisual`: キャラクター立ち絵画像から外見特徴Markdownを自動抽出。
  * `generateCharacterPose`: 保存時に「正面（front）」「横向き（side）」のポーズ立ち絵を並列で自動生成。
  * `extractSceneSituation`: 小説の本文からシーンの構図や表情、時間帯等のMarkdownを自動抽出。
  * `generateIllustration`: シーン設定Markdownと、登録された複数のキャラクターアングル立ち絵画像をマルチモーダルで参照し、指定されたカメラ構図で挿絵を生成。

---

## 🛠️ 主要な技術スタック

* **フレームワーク**: Next.js 16.3.0 / React 19.2.8
* **開発言語**: TypeScript / JavaScript
* **データベース**: Dexie.js (IndexedDB ラッパー)
* **API連携先**:
  * **画像生成**: NanobananaPro (Google AI Studio経由 / モデルID: `gemini-3-pro-image-preview`)
  * **解析/テキスト抽出**: Gemini API (モデルID: `gemini-3.6-flash`)

---

## 💡 フレームワーク（Next.js）とアプリケーションの切り分け解説

本プロジェクトにおける「フレームワーク」と「アプリケーション」の役割分担は以下の通りです。

### 1. フレームワーク (Next.js / React) ── 「土台・仕組み」
Next.js や React は、プログラムを動かすための**「ルールとインフラ（土台）」**です。これらは自分で開発したものではなく、世の中の標準的なツールを利用しています。
* **役割**:
  * `npm run dev` で起動するローカル開発用サーバーの提供。
  * `src/app/` のような決まったフォルダ構成にファイルを置くことで、自動的に画面が用意される仕組み（ルーティング）。
  * TypeScriptやCSSのコードを、ブラウザが解釈・表示できる状態へ最適化・変換（ビルド）する役割。
  * 画面の値が書き換わった際に、HTMLを自動で効率よく再描画する仕組み（Reactのコア機能）。
* **該当するファイル**: `package.json`（設定・依存関係定義）、`node_modules/`（ダウンロードされたライブラリ群）、`next.config.ts` や `tsconfig.json` などの設定ファイル。

### 2. アプリケーション ── 「自作した機能・コンテンツ」
私たちがフレームワーク（Next.js）の提供する土台の上で、独自に書き上げた**「挿絵メーカーそのもの」**のプログラムです。
* **役割**:
  * 「小説」「キャラクター」「シーン」を関連付けてIndexedDBに保存する処理ロジック。
  * Gemini APIを用いて本文からシーン設定を抽出し、NanobananaPro APIで挿絵を生成する処理ロジック。
  * ボタンやテキストエリアのレイアウト、ダークテーマで装飾されたデザイン（CSS）。
* **該当するファイル**: `src/` ディレクトリ配下にあるすべてのファイル（`src/app/page.tsx`, `src/lib/db.ts`, `src/lib/ai.ts`, `src/app/globals.css` など）。
