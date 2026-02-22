# AI-secretary

## モノレポ構成

- `apps/desktop-agent`: Electron常駐エージェント
- `apps/mobile-web`: Mobile Web UI
- `infra/cdk`: AWS CDK（Command API / Cognito / DynamoDB）
- `docs`: 実装資料 / 文脈資料

## セルフホスト監査結果（2026-02）

本リポジトリ内で人が自前サーバー環境にデプロイするために必要な情報を監査し、以下を必須手順として整理した。

- 実行前提（Node / pnpm / AWS認証 / Windows常駐要件）
- インフラ（CDK build / synth / deploy）
- Mobile Web設定値（`window.__AI_SECRETARY_CONFIG__`）
- Desktop Agent設定値（`apps/desktop-agent/config/local.json`）
- 起動確認用の最小疎通テスト

## 1. 前提条件

- OS:
  - Desktop Agentを常駐実行するホストは Windows。
  - CDKデプロイやWebビルドは Linux / macOS / Windows いずれでも可。
- ツール:
  - Node.js `20.19.6`
  - pnpm `9.15.4`
  - AWS CLI（認証済みプロファイル）
- AWSアカウントに CDK デプロイ権限があること。

## 2. 初期セットアップ

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
```

## 3. AWS Control Plane のデプロイ

### 3.1 CDK bootstrap（初回のみ）

```bash
pnpm --filter @ai-secretary/infra-cdk build
pnpm dlx cdk bootstrap aws://<AWS_ACCOUNT_ID>/<AWS_REGION> --app "node infra/cdk/dist/bin/main.js"
```

### 3.2 CDK deploy

```bash
pnpm --filter @ai-secretary/infra-cdk build
pnpm dlx cdk deploy AiSecretaryControlPlaneStack --require-approval never --app "node infra/cdk/dist/bin/main.js"
```

### 3.3 デプロイ後に控える値

CDK Outputs から以下を取得し、Mobile Web/運用設定に使う。

- `CommandApiUrl`
- `UserPoolId`
- `UserPoolClientId`

## 4. Mobile Web の配備

1. `apps/mobile-web/index.html` の `window.__AI_SECRETARY_CONFIG__` をデプロイ先値に更新する。
   - `apiBaseUrl`: `CommandApiUrl`
   - `cognitoDomain`: 作成した Cognito Hosted UI ドメイン
   - `cognitoClientId`: `UserPoolClientId`
   - `cognitoRedirectUri`: Mobile Web の公開URL
2. ビルドする。

```bash
pnpm --filter @ai-secretary/mobile-web build
```

3. `apps/mobile-web` 配下（`index.html` と `dist/main.js`）を静的ホスティングへ配置する。

## 5. Desktop Agent の配備（Windowsホスト）

1. 設定ファイル `apps/desktop-agent/config/local.json` を配置する（Gitにコミットしない）。
2. 最低限、以下のキーを設定する。
   - `appName`
   - `sqlitePath`
   - `skillManifestPath`
   - `notesRootPath`
   - `gitSyncFailureEmailTo`
   - `calendarEventsPath`
   - `googleCalendar.calendarId`
   - `googleCalendar.accessTokenEnvVar`
3. `googleCalendar.accessTokenEnvVar` で指定した環境変数（既定: `GOOGLE_CALENDAR_ACCESS_TOKEN`）へアクセストークンを設定する。
4. 起動する。

```bash
pnpm --filter @ai-secretary/desktop-agent build
node apps/desktop-agent/dist/main.js
```

## 6. 最小疎通確認（運用前チェック）

1. Mobile Webで Cognito ログインを実施する。
2. `devtask.submit` を送信し、`queued` → `running` → `succeeded/failed` の状態遷移を確認する。
3. Desktop Agent の SQLite（`audit_logs`, `command_requests`, `git_exports`）に実行記録が残ることを確認する。
4. `note.export` を失敗させた場合、`gitSyncFailureEmailTo` へメール通知が送信されることを確認する。

## 7. ドキュメント

### 実装資料（実装エージェント向け）
- アーキテクチャ仕様: `docs/ai-secretary-architecture-ja.md`
- 実装仕様: `docs/implementation-plan-ja.md`
- 実装TODO: `docs/implementation-todo-ja.md`

### 文脈資料（背景ログ）
- 文脈ノート: `docs/context-notes-ja.md`

### 追加確認事項
- 最小質問一覧: `docs/open-questions-ja.md`

## ドキュメント運用ルール

- 実装資料は「何を実装するか」のみ記述。
- 文脈資料は「なぜそうなったか」のみ記述。
- 詳細ルールは `AGENTS.md` を参照。
