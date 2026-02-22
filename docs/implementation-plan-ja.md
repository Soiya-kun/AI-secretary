# AI秘書 実装仕様（実装エージェント向け）

## 1. 実装ゴール

以下を満たす実装を完了させる。

1. 常駐エージェントが定期実行と外部指示実行を行う。
2. Meet自動参加と画面共有開始を別skillで実行する。
3. 音声をSTTし、呼びかけ時にTTS応答をMeetへ返す。
4. 議事録と要約をMarkdown化しGit管理する。
5. スマホWeb UIからインターネット越しに安全にコマンド投入できる。

## 2. 実装対象（モノレポ）

```text
/apps/desktop-agent
/apps/mobile-web
/infra/cdk
/docs
```

## 3. Desktop実装要件

### 3.1 Agent Runtime
- ジョブスケジューラを実装。
- ジョブ優先度: meeting系 > note系 > devtask系。
- システム再試行は最大3回。

### 3.2 Skill Runtime
- skill manifest ローダ実装。
- hot reload 実装。
- orchestrator は Claude Code 固定。
- runnerは Codex/Gemini/Claude CLI をサポート。
- orchestrator 障害時の自動フォールバックは実装しない。

### 3.3 Meeting Module
- `join_meet` 実装。
- `share_screen_meet` 実装（joinと分離）。
- 失敗時ログと再試行回数を記録。

### 3.4 Audio Module
- 入力: 会議音声 + マイク。
- STT: chunk処理。
- TTS: 呼びかけ時のみ。
- 出力: OS既定仮想マイク。
- 会話継続モード: 20秒無音で終了。
- raw音声保持: 通常0、障害時のみ最大5分で自動削除。

### 3.5 Notes Module
- Markdown生成（固定セクション7項目）。
- repo判定不能時 `notes/inbox-notes` 保存。
- 再割当はチャットコマンドで実行。
- `devtask.submit` で対象ディレクトリが無い場合は自動作成する。
- push方式はskill定義に従う。
- Git同期失敗通知はメールを第一通知チャネルとする。

## 4. Cloud実装要件（AWS）

### 4.1 API
- API Gateway + Lambdaで command API を提供。
- 必須API:
  - `POST /v1/commands`
  - `GET /v1/commands/{id}`
  - `POST /v1/commands/{id}/cancel`

### 4.2 Auth
- Cognito OIDC認証を必須化。
- access token scopeでコマンド制御。

### 4.3 State Store
- DynamoDBに command/state を保存。
- Desktopは command queue を取得して処理。

### 4.4 IaC
- CDK TypeScript で全スタック実装。
- desktop設定パラメータも同一モノレポで管理。

## 5. Mobile Web実装要件

- Cognitoログイン。
- command送信UI。
- command状態表示UI（queued/running/succeeded/failed）。
- `devtask.submit` を送信可能。
- 初期権限は単一ロール（全コマンド許可）で開始する。

## 6. 受け入れ基準

1. 会議開始5分前〜1分後で `join_meet` 成功。
2. `share_screen_meet` 単体実行成功。
3. 呼びかけ後2秒以内に一次応答（テキストまたは音声）。
4. 会話継続モードが20秒無音で終了。
5. 会議終了後、Markdown議事録がGitへ反映。
6. repo不明時に `inbox-notes` へ退避。
7. スマホWeb UIから `devtask.submit` を投入し完了状態を確認可能。
8. 監査ログに command_id, skill, retry_count が残る。
9. Git同期失敗時にメール通知が送信される。
10. `devtask.submit` 実行時、対象ディレクトリが無い場合に自動作成される。

## 7. 非機能要件

- 監査ログ欠損率 0%。
- command API の認証なしアクセスは常時拒否。
- raw音声一時保存データはTTL削除で5分超過を禁止。


## 8. リリース・運用手順（確定）

### 8.1 起動/停止/障害対応手順
- Desktop Agent 起動手順:
  1. `pnpm --filter @ai-secretary/desktop-agent build`
  2. `node apps/desktop-agent/dist/main.js`
- Desktop Agent 停止手順:
  1. OSプロセスマネージャーで `main.js` プロセスを終了。
- 障害一次対応:
  1. `audit_logs` の最新 `status=failed` 行を確認。
  2. 同一 `audit_id` で `command_requests` と `git_exports` を照合。
  3. `retry_count < 3` の場合は同一コマンドを再投入。
  4. `retry_count = 3` の場合は `note.export` を停止し `notes/inbox-notes` へ退避。

### 8.2 secrets設定手順
- 必須シークレット:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_CLIENT_ID`
  - `API_BASE_URL`
- 設定方法:
  1. Desktop は `apps/desktop-agent/config/local.json` に非コミットで配置。
  2. Mobile Web はデプロイ時に環境変数注入。
  3. Lambda は CDK デプロイ時に環境変数設定。
- 検証基準:
  - secrets未設定時は起動時に即時エラーを返し、デフォルト値で継続しない。

### 8.3 ログ保守手順
- 監査ログ保守対象:
  - SQLite `audit_logs`
  - SQLite `command_requests`
  - SQLite `git_exports`
- 保守上限:
  - `audit_logs` は 90日保持。
  - 90日超過分は日次バッチで削除。
- 障害時音声一時ファイル:
  - 5分TTLで削除し、手動延長を禁止。

### 8.4 バージョニング方針
- 方式: Semantic Versioning（`MAJOR.MINOR.PATCH`）。
- 判定:
  - 破壊的変更: MAJOR を +1。
  - 後方互換機能追加: MINOR を +1。
  - バグ修正のみ: PATCH を +1。
- タグ形式: `vX.Y.Z`。

### 8.5 初回リリースタグ作成手順
- 初回タグは `v0.1.0` とする。
- 実施手順:
  1. `pnpm -r test` を成功させる。
  2. `git tag -a v0.1.0 -m "Initial release v0.1.0"`
  3. `git push origin v0.1.0`

### 8.6 セルフホスト運用手順の必須記載項目
- 人手運用ドキュメント（README）には以下を必須記載する。
  1. 前提ツール版本（Node `22.14.0`, pnpm `9.15.4`）。
  2. AWSデプロイ手順（CDK build, bootstrap, deploy）。
  3. Mobile Web の設定キー（`apiBaseUrl`, `cognitoDomain`, `cognitoClientId`, `cognitoRedirectUri`, `cognitoScope`）。
  4. Desktop Agent の設定キー（`appName`, `sqlitePath`, `skillManifestPath`, `notesRootPath`, `gitSyncFailureEmailTo`, `calendarEventsPath`, `googleCalendar.*`）。
  5. 最小疎通確認手順（Cognitoログイン、`devtask.submit` 状態遷移確認、SQLite監査ログ確認、Git同期失敗メール確認）。
- 上記5項目が欠ける場合、セルフホスト手順は未完了と判定する。

## 9. Claude Code主軸エージェント運用要件（追加確定）

### 9.1 目的
- 本システムは Claude Code を主軸エージェントとして常時稼働させる。
- Codex CLI / Gemini CLI は Claude Code の指示で起動する実行ワーカーとして扱う。
- システム全体は OpenClaw 類似の自律運用（待機・受令・並列実行・監査）を実現する。

### 9.2 常時稼働要件
- Desktop Agent は起動中に `claude supervisor` セッションを1つ維持する。
- `claude supervisor` が異常終了した場合、10秒以内に再起動を試行する。
- `claude supervisor` 再起動は連続3回まで行い、3回失敗時は `agent.degraded` を記録して通知する。

### 9.3 複数CLIオーケストレーション要件
- Claude Code は task ごとに `codex worker` / `gemini worker` の起動要求を発行できる。
- Desktop Agent は worker 起動要求を受け、Windows上で独立プロセス（必要時は独立ウィンドウ）として起動する。
- 独立ウィンドウ起動は skill manifest の `openInNewWindow=true` 指定時のみ許可する。
- 同時実行上限は `codex <= 2`, `gemini <= 2` とする。
- worker 実行結果（exit_code, stdout, stderr, artifact_path）を supervisor へ返却する。

### 9.4 Skill運用要件
- skill は運用開始後に追加・更新できる。
- skill manifest 変更時は hot reload で反映し、Desktop Agent 再起動を不要とする。
- すべての skill は `owner`, `commandType`, `runner`, `timeoutSec`, `retryPolicy` を必須フィールドとする。
- `openInNewWindow` は任意フィールド（boolean）とし、true の場合のみ独立ウィンドウ起動を有効化する。
- 未定義 commandType を受信した場合は実行せず `unsupported_command` として監査ログへ保存する。

### 9.5 リモート指示要件
- スマホWeb UIから投入した command は 5秒以内に Desktop のローカルキューへ反映する。
- commandType 名称は Cloud API / Mobile UI / Desktop Runtime で同一文字列を使用する。
- command payload schema は commandType ごとに単一定義とし、`repo` / `repository` のような別名を禁止する。

### 9.6 セットアップ要件
- README に Claude/Codex/Gemini CLI のインストール手順、認証手順、疎通確認手順を必須記載する。
- README に supervisor 起動確認、worker 起動確認、remote command 疎通確認を必須記載する。
- 運用開始前に `pnpm -r test` と `agent smoke test` を成功させることをリリース条件とする。

### 9.7 受け入れ基準（追加）
1. Desktop 起動後60秒以内に `claude supervisor` が `running` になる。
2. supervisor 異常終了時、10秒以内に再起動が実行される。
3. Mobile から `devtask.submit` を送信すると、Claude 経由で worker が起動し、`running` へ遷移する。
4. `codex` と `gemini` の各2並列を超える要求はキューイングされる。
5. commandType / payload schema 不一致は実行されず監査ログに `validation_error` が残る。
6. skill manifest 変更が再起動なしで反映される。
