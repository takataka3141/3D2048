# 3D 2048 Prototype

3次元版2048の初期プロトタイプです。4 x 4 x 4 の立方体ボードを斜め視点で表示し、上下左右、奥、手前の6方向へ一斉移動できます。

## 遊び方

- `W` / `↑`: 上へ
- `S` / `↓`: 下へ
- `A` / `←`: 左へ
- `D` / `→`: 右へ
- `Q`: 奥へ
- `E`: 手前へ
- 画面下のボタンでも操作できます。

## ローカル確認

```powershell
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。ビルド工程は不要です。

## 無料公開の候補

最初は静的サイトとして公開するのが一番安く、運用も軽いです。

- GitHub Pages: リポジトリだけで公開できる。個人制作の初期版に向く。
- Cloudflare Pages: 無料枠が広く、表示も速い。将来オンライン対戦のAPIを足す時もCloudflare Workersへ拡張しやすい。
- Netlify: 設定が簡単。プレビュー公開もしやすい。

おすすめは、初期公開なら GitHub Pages、将来の対戦サーバーまで見据えるなら Cloudflare Pages です。

## 対戦化ロードマップ

1. 一人用の完成度を上げる
   - ゲームオーバー演出
   - 盤面サイズ変更
   - スマホの操作感調整
   - スコア演出と合体アニメーション

2. 攻撃ルールを決める
   - 1手で複数合体した数をコンボ扱いにする
   - 大きい数字の合体ほど攻撃力を上げる
   - 連続ターンで合体が続いたらボーナスを加える

3. お邪魔ブロックを入れる
   - お邪魔は一定ターン、または一定秒数で消える
   - コンボが大きい時は個数を増やすか、消えるまでの時間を伸ばす
   - お邪魔は合体不可にして、移動だけは通常ブロックと同じにする

4. CPU戦を作る
   - まずはランダム合法手
   - 次に「空きマス」「合体可能数」「最大タイル位置」を評価する簡易AI
   - 難易度ごとに読み手数を変える

5. オンライン対戦を作る
   - クライアントは静的サイトのまま
   - 対戦の同期だけサーバー、またはWebSocketで管理
   - 最初はフレンド対戦、次にCPU代替やランダムマッチへ拡張

## 実装メモ

- `index.html`: 画面構造
- `styles.css`: レスポンシブUI
- `game.js`: 盤面ロジックとThree.js描画

今は一人用の盤面処理と描画を同じファイルに置いています。対戦を入れる段階で、盤面ロジック、入力、描画、対戦同期を分割すると拡張しやすくなります。

## Current battle prototype

- `Solo`: normal practice mode.
- `CPU`: the player moves, then a simple evaluation AI chooses the CPU move.
- `Friend`: local pass-and-play battle. P1 and P2 alternate turns on one device.
- Garbage blocks are black, cannot merge, show a remaining-seconds label, and fade out until they disappear.
- Multiple merges in one move create attack power. In battle modes, attack power adds garbage blocks to the opponent board.
