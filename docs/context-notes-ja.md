# 文脈ノート（背景・意思決定ログ）

このファイルは実装そのものではなく、意思決定背景を保存するための記録。

## 1. 主要決定の背景

- 画面操作はPlaywrightを使わず、skills中心で運用しながら改善する方針。
- 議事録repo判定やgit同期方式は固定せず、skill改善で追従する方針。
- スマホ経路はWeb UIで十分という判断。
- 初期からインターネット越し運用を前提にし、AWSで制御平面を置く。
- 高リスク操作は確認ダイアログを省略するYOLO運用を採用。

## 2. ユーザー回答反映メモ

- OS: Windowsのみ。
- 画面共有: 別skillでMeet実共有まで。
- TTS: 呼びかけ時のみ、会話中は継続応答。
- 会話継続タイムアウト: 20秒。
- raw音声: 永続保存不要、一時保存は許容。
- orchestrator: Claude Code中心。
- orchestrator障害時の自動フォールバック: 不要。

## 3. 変更運用方針

- 仕様変更はまず `docs/context-notes-ja.md` に背景追記し、
  その後 `docs/ai-secretary-architecture-ja.md` と `docs/implementation-plan-ja.md` を更新する。
- 実装エージェントは context ファイルを参照する必要がある場合のみ読む。


## 4. 追加確定（今回）

- `devtask.submit` 実行時、対象ディレクトリが無ければ自動作成。
- Mobile Web UI 初期権限は単一ロール（全コマンド許可）。
- Git同期失敗時の通知先はメール。
