# 実装TODOチェックリスト（小粒度）

このファイルは実装進捗をチェック可能にするためのタスクリスト。

記法:
- [ ] 未着手
- [x] 完了

---

## 0. リポジトリ初期化

- [x] モノレポ構成 `/apps/desktop-agent` `/apps/mobile-web` `/infra/cdk` `/docs` を作成
- [x] Node.js / pnpm / TypeScript のバージョン固定
- [x] ルート `package.json` に workspace 定義を追加
- [x] 共通 ESLint / Prettier / tsconfig を配置
- [x] `.env.example` を作成（desktop / mobile / aws）

## 1. Desktop Agent 基盤

- [x] Electron main プロセス起動を実装
- [ ] 常駐（tray）起動オプションを実装
- [x] ローカル設定ファイル読み込みを実装
- [x] SQLite 初期化処理を実装
- [x] `audit_logs` テーブル作成を実装
- [x] `command_requests` テーブル作成を実装
- [x] `git_exports` テーブル作成を実装

## 2. Agent Runtime

- [ ] ジョブキューを実装
- [ ] 優先度（meeting > note > devtask）を実装
- [ ] スケジューラ（定期起動）を実装
- [ ] 外部コマンドトリガー（手動/remote）を実装
- [ ] 共通ジョブ実行インターフェースを実装
- [ ] リトライ制御（最大3回）を実装
- [ ] キャンセル制御（job.cancel）を実装

## 3. Skill Runtime

- [ ] skill manifest ローダを実装
- [ ] manifest バリデーションを実装
- [ ] skill hot reload を実装
- [ ] Claude Code orchestrator 呼び出しを実装
- [ ] Codex CLI runner を実装
- [ ] Gemini CLI runner を実装
- [ ] 実行結果（status/artifacts）正規化を実装
- [ ] skill実行ログを `audit_logs` に保存

## 4. Meeting Module

- [ ] Google Calendar API 接続を実装
- [ ] 会議イベント取得を実装
- [ ] Meet URL 抽出を実装
- [ ] `join_meet` skill 呼び出しを実装
- [ ] `share_screen_meet` skill 呼び出しを実装
- [ ] 参加成功判定を実装
- [ ] 画面共有成功判定を実装
- [ ] 失敗時リトライ連携を実装

## 5. Audio Module

- [ ] 音声入力（会議音声 + マイク）取得を実装
- [ ] chunk分割を実装
- [ ] STT送信クライアントを実装
- [ ] TTS生成クライアントを実装
- [ ] 仮想マイク出力を実装
- [ ] 呼びかけ時のみTTS再生ルールを実装
- [ ] 会話継続モード（20秒無音）を実装
- [ ] raw音声の一時保存（最大5分TTL削除）を実装

## 6. Notes Module

- [ ] 固定7セクションMarkdown生成を実装
- [ ] `repo:<owner/name>` 判定の入力抽出を実装
- [ ] repo判定skill実行を実装
- [ ] 不明時 `notes/inbox-notes` 保存を実装
- [ ] `devtask.submit` 対象ディレクトリ自動作成を実装
- [ ] Git add/commit/push 実行を実装
- [ ] push方式（直push/PR/保留）のskill連携を実装
- [ ] Git同期失敗時メール通知を実装
- [ ] Git同期結果を `git_exports` に保存

## 7. AWS Control Plane（CDK）

- [ ] CDK TypeScript プロジェクト初期化
- [ ] Cognito User Pool / App Client を作成
- [ ] API Gateway を作成
- [ ] Lambda（command API）を作成
- [ ] DynamoDB（commands/state）を作成
- [ ] IAM最小権限ポリシーを設定
- [ ] `POST /v1/commands` を実装
- [ ] `GET /v1/commands/{id}` を実装
- [ ] `POST /v1/commands/{id}/cancel` を実装
- [ ] command_id単位の状態遷移を実装

## 8. Mobile Web UI

- [ ] Cognitoログイン画面を実装
- [ ] コマンド入力フォームを実装
- [ ] commandType選択（5種）を実装
- [ ] command送信処理を実装
- [ ] ステータス表示（queued/running/succeeded/failed）を実装
- [ ] 単一ロール（全コマンド許可）を実装
- [ ] `devtask.submit` 専用入力UIを実装

## 9. 監査・運用

- [ ] 全コマンドに監査ID付与を実装
- [ ] 監査ログ必須書き込みを実装
- [ ] YOLOモード（確認ダイアログなし）を実装
- [ ] 認証なしAPI拒否を実装
- [ ] 監査ログ欠損率0%の検証を実装

## 10. E2E受け入れテスト

- [ ] 会議開始5分前〜1分後の join_meet 成功テスト
- [ ] share_screen_meet 単体実行テスト
- [ ] 呼びかけ後2秒以内の一次応答テスト
- [ ] 20秒無音で会話継続モード終了テスト
- [ ] 会議終了後Markdown出力 + Git反映テスト
- [ ] repo不明時 inbox-notes 退避テスト
- [ ] `devtask.submit` 実行と状態確認テスト
- [ ] Git同期失敗時メール通知テスト
- [ ] raw音声5分TTL削除テスト

## 11. リリース準備

- [ ] 運用手順書（起動/停止/障害対応）を作成
- [ ] secrets設定手順を作成
- [ ] ログ保守手順を作成
- [ ] バージョニング方針を決定
- [ ] 初回リリースタグを作成
