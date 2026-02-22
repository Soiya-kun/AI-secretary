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
