# 実装TODOチェックリスト（小粒度）

このファイルは実装進捗をチェック可能にするためのタスクリスト。

記法:
- [ ] 未着手
- [x] 完了

---

## A. アーカイブ（v1完了タスク）

以下は従来計画の完了タスクを保存したアーカイブ。削除せず履歴として保持する。

## 0. リポジトリ初期化

- [x] モノレポ構成 `/apps/desktop-agent` `/apps/mobile-web` `/infra/cdk` `/docs` を作成
- [x] Node.js / pnpm / TypeScript のバージョン固定
- [x] ルート `package.json` に workspace 定義を追加
- [x] 共通 ESLint / Prettier / tsconfig を配置
- [x] `.env.example` を作成（desktop / mobile / aws）

## 1. Desktop Agent 基盤

- [x] Electron main プロセス起動を実装
- [x] 常駐（tray）起動オプションを実装
- [x] ローカル設定ファイル読み込みを実装
- [x] SQLite 初期化処理を実装
- [x] `audit_logs` テーブル作成を実装
- [x] `command_requests` テーブル作成を実装
- [x] `git_exports` テーブル作成を実装

## 2. Agent Runtime

- [x] ジョブキューを実装
- [x] 優先度（meeting > note > devtask）を実装
- [x] スケジューラ（定期起動）を実装
- [x] 外部コマンドトリガー（手動/remote）を実装
- [x] 共通ジョブ実行インターフェースを実装
- [x] リトライ制御（最大3回）を実装
- [x] キャンセル制御（job.cancel）を実装

## 3. Skill Runtime

- [x] skill manifest ローダを実装
- [x] manifest バリデーションを実装
- [x] skill hot reload を実装
- [x] Claude Code orchestrator 呼び出しを実装
- [x] Codex CLI runner を実装
- [x] Gemini CLI runner を実装
- [x] 実行結果（status/artifacts）正規化を実装
- [x] skill実行ログを `audit_logs` に保存

## 4. Meeting Module

- [x] Google Calendar API 接続を実装
- [x] 会議イベント取得を実装
- [x] Meet URL 抽出を実装
- [x] `join_meet` skill 呼び出しを実装
- [x] `share_screen_meet` skill 呼び出しを実装
- [x] 参加成功判定を実装
- [x] 画面共有成功判定を実装
- [x] 失敗時リトライ連携を実装

## 5. Audio Module

- [x] 音声入力（会議音声 + マイク）取得を実装
- [x] chunk分割を実装
- [x] STT送信クライアントを実装
- [x] TTS生成クライアントを実装
- [x] 仮想マイク出力を実装
- [x] 呼びかけ時のみTTS再生ルールを実装
- [x] 会話継続モード（20秒無音）を実装
- [x] raw音声の一時保存（最大5分TTL削除）を実装

## 6. Notes Module

- [x] 固定7セクションMarkdown生成を実装
- [x] `repo:<owner/name>` 判定の入力抽出を実装
- [x] repo判定skill実行を実装
- [x] 不明時 `notes/inbox-notes` 保存を実装
- [x] `devtask.submit` 対象ディレクトリ自動作成を実装
- [x] Git add/commit/push 実行を実装
- [x] push方式（直push/PR/保留）のskill連携を実装
- [x] Git同期失敗時メール通知を実装
- [x] Git同期結果を `git_exports` に保存

## 7. AWS Control Plane（CDK）

- [x] CDK TypeScript プロジェクト初期化
- [x] Cognito User Pool / App Client を作成
- [x] API Gateway を作成
- [x] Lambda（command API）を作成
- [x] DynamoDB（commands/state）を作成
- [x] IAM最小権限ポリシーを設定
- [x] `POST /v1/commands` を実装
- [x] `GET /v1/commands/{id}` を実装
- [x] `POST /v1/commands/{id}/cancel` を実装
- [x] command_id単位の状態遷移を実装

## 8. Mobile Web UI

- [x] Cognitoログイン画面を実装
- [x] コマンド入力フォームを実装
- [x] commandType選択（5種）を実装
- [x] command送信処理を実装
- [x] ステータス表示（queued/running/succeeded/failed）を実装
- [x] 単一ロール（全コマンド許可）を実装
- [x] `devtask.submit` 専用入力UIを実装

## 9. 監査・運用

- [x] 全コマンドに監査ID付与を実装
- [x] 監査ログ必須書き込みを実装
- [x] YOLOモード（確認ダイアログなし）を実装
- [x] 認証なしAPI拒否を実装
- [x] 監査ログ欠損率0%の検証を実装

## 10. E2E受け入れテスト

- [x] 会議開始5分前〜1分後の join_meet 成功テスト
- [x] share_screen_meet 単体実行テスト
- [x] 呼びかけ後2秒以内の一次応答テスト
- [x] 20秒無音で会話継続モード終了テスト
- [x] 会議終了後Markdown出力 + Git反映テスト
- [x] repo不明時 inbox-notes 退避テスト
- [x] `devtask.submit` 実行と状態確認テスト
- [x] Git同期失敗時メール通知テスト
- [x] raw音声5分TTL削除テスト

## 11. リリース準備

- [x] 運用手順書（起動/停止/障害対応）を作成
- [x] secrets設定手順を作成
- [x] ログ保守手順を作成
- [x] バージョニング方針を決定
- [x] 初回リリースタグを作成


---

## B. 新規実装計画（Claude主軸エージェント化）

### B1. Supervisor常駐化（Claude Code）
- [x] `claude supervisor` 常駐プロセス管理を実装
- [x] supervisor ヘルスチェック（1分周期）を実装
- [x] supervisor 異常終了時の10秒以内再起動を実装
- [x] 連続3回失敗時の `agent.degraded` 通知を実装

### B2. Workerオーケストレーション（Codex/Gemini）
- [x] Claude指示による worker 起動プロトコルを実装
- [x] Codex worker プール（最大2並列）を実装
- [x] Gemini worker プール（最大2並列）を実装
- [x] worker 実行結果（exit_code/stdout/stderr/artifacts）標準化を実装
- [x] 必要時に独立ウィンドウで起動するオプションを実装

### B3. Skill仕様強化
- [x] skill manifest schema に `owner`, `timeoutSec`, `retryPolicy` を追加
- [x] manifest schema バリデーションを強化
- [x] 未定義 commandType を `unsupported_command` として監査保存
- [x] hot reload 失敗時のロールバック挙動を実装

### B4. Remote Command経路の実装完了
- [x] Desktop に command API ポーリング/購読クライアントを実装
- [x] Remote command をローカルキューへ5秒以内反映
- [x] Cloud/Mobile/Desktop の commandType 名称を統一
- [x] commandTypeごとの payload schema 検証を実装
- [x] `repo` / `repository` 等の別名禁止バリデーションを実装

### B5. OpenClaw類似の自律運用機能
- [x] 待機状態からの自律タスク再開（resume）を実装
- [x] 複数タスクの優先度付き並列スケジューリングを実装
- [x] タスク間成果物受け渡し（artifact handoff）を実装
- [x] 長時間タスクの中間状態チェックポイントを実装

### B6. セットアップ/運用導線整備
- [x] README に Claude/Codex/Gemini CLI の導入・認証手順を追加
- [x] README に supervisor/worker 疎通確認手順を追加
- [x] README に remote command E2E疎通手順を追加
- [x] 運用障害時の復旧Runbook（supervisor/worker別）を追加

### B7. 受け入れテスト（新要件）
- [x] supervisor 常駐起動テスト（60秒以内running）
- [x] supervisor 再起動テスト（10秒以内）
- [x] codex/gemini 各2並列上限テスト
- [x] commandType/payload schema 不一致拒否テスト
- [x] skill hot reload 無停止反映テスト
- [x] Mobile→Cloud→Desktop→worker 実行のE2Eテスト
