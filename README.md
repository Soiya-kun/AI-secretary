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
- Cognito Hosted UI ドメイン / テストユーザー準備手順
- Desktop Agent 用 Bearer トークン払い出し手順
- Electron プロセスとしての正しい起動手順

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

### 3.4 Cognito Hosted UI ドメイン作成

Mobile Web のログインに Cognito Hosted UI ドメインが必須。

```bash
aws cognito-idp create-user-pool-domain \
  --user-pool-id <UserPoolId> \
  --domain <UNIQUE_DOMAIN_PREFIX>
```

作成後、`https://<UNIQUE_DOMAIN_PREFIX>.auth.<AWS_REGION>.amazoncognito.com` を `cognitoDomain` に使う。

### 3.5 初期オペレーターユーザー作成

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username <OPERATOR_EMAIL> \
  --user-attributes Name=email,Value=<OPERATOR_EMAIL> Name=email_verified,Value=true \
  --temporary-password '<TEMP_PASSWORD>'

aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username <OPERATOR_EMAIL> \
  --password '<STRONG_PASSWORD>' \
  --permanent
```

### 3.6 User Pool Client の OAuth 設定更新

本リポジトリのCDK定義だけでは Hosted UI 用の callback/logout URL が未設定のため、デプロイ後に User Pool Client 設定を更新する。

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id <UserPoolId> \
  --client-id <UserPoolClientId> \
  --allowed-o-auth-flows-user-pool-client \
  --allowed-o-auth-flows implicit \
  --allowed-o-auth-scopes openid email profile \
  --callback-urls 'https://<MOBILE_WEB_HOST>' \
  --logout-urls 'https://<MOBILE_WEB_HOST>' \
  --supported-identity-providers COGNITO
```

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
   - `remoteCommand.enabled`
   - `remoteCommand.baseUrl`
   - `remoteCommand.pollIntervalMs`
   - `remoteCommand.authTokenEnvVar`
   - `supervisor.enabled`
   - `supervisor.healthcheckIntervalMs`
   - `supervisor.restartDelayMs`
   - `supervisor.maxConsecutiveFailures`
3. `googleCalendar.accessTokenEnvVar` で指定した環境変数（既定: `GOOGLE_CALENDAR_ACCESS_TOKEN`）へアクセストークンを設定する。
4. Worker CLI をインストールし、認証を完了する。

```bash
# Claude Code
claude --version
claude auth login

# Codex CLI
codex --version
codex login

# Gemini CLI
gemini --version
gemini auth login
```

5. `remoteCommand.authTokenEnvVar` で指定した環境変数に Command API 呼び出し用トークンを設定する。

```bash
# 例: USER_PASSWORD_AUTH で AccessToken を取得して環境変数へ設定
export COMMAND_API_TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <UserPoolClientId> \
  --auth-parameters USERNAME=<OPERATOR_EMAIL>,PASSWORD='<STRONG_PASSWORD>' \
  --query 'AuthenticationResult.AccessToken' \
  --output text)
```

`remoteCommand.authTokenEnvVar` が `COMMAND_API_TOKEN` の場合、Desktop Agent は上記値を Bearer トークンとして使用する。
AccessToken は有効期限があるため、運用時は定期更新（または自動更新ジョブ）を必須とする。
6. supervisor / worker 疎通確認を実施する。

```bash
# supervisor 単体確認
claude supervisor --help

# worker 単体確認
codex --help
gemini --help
```
7. 起動する。

```bash
pnpm --filter @ai-secretary/desktop-agent build
pnpm --filter @ai-secretary/desktop-agent exec electron apps/desktop-agent/dist/main.js
```

`local.json` をリポジトリルート以外に置く場合は、起動前に `DESKTOP_CONFIG_PATH` を設定する。

```bash
export DESKTOP_CONFIG_PATH='C:/path/to/local.json'
```

## 6. 最小疎通確認（運用前チェック）

1. Mobile Webで Cognito ログインを実施する。
2. `devtask.submit` を送信し、`queued` → `running` → `succeeded/failed` の状態遷移を確認する。
3. Desktop Agent の SQLite（`audit_logs`, `command_requests`, `git_exports`）に実行記録が残ることを確認する。
4. `note.export` を失敗させた場合、`gitSyncFailureEmailTo` へメール通知が送信されることを確認する。

### 6.1 Remote command E2E 疎通

1. Desktop Agent 起動中に Command API へ `devtask.submit` を送信する。

```bash
curl -X POST "${COMMAND_API_URL}/v1/commands" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${COMMAND_API_TOKEN}" \
  -d '{"commandType":"devtask.submit","payload":{"repository":"owner/repo","task":"Run E2E"}}'
```

2. 5秒以内に Desktop Agent 側で remote queue 取り込みが発生し、`audit_logs` に実行記録が追加されることを確認する。
3. `GET /v1/commands/{id}` で `running` もしくは終端状態へ遷移していることを確認する。

```bash
curl -H "Authorization: Bearer ${COMMAND_API_TOKEN}" "${COMMAND_API_URL}/v1/commands/${COMMAND_ID}"
```

## 7. 障害復旧 Runbook（supervisor / worker）

### 7.1 supervisor 復旧

1. `agent.degraded` 監査ログが発生しているか確認する。
2. `claude` コマンド自体の実行可否を確認する（PATH / 認証期限）。
3. 認証期限切れの場合は `claude auth login` を再実施する。
4. Desktop Agent を再起動し、60秒以内に supervisor が再起動して以後安定することを確認する。

### 7.2 worker 復旧

1. `codex --version` / `gemini --version` で CLI の生存確認を行う。
2. `codex login` / `gemini auth login` を再実施し、トークン期限切れを解消する。
3. 失敗した command を再送し、2並列制限内で `running` に遷移することを確認する。
4. 連続失敗が継続する場合は worker CLI を再インストールして Desktop Agent を再起動する。

## 8. ドキュメント

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


## 9. 追加の機能監査メモ（2026-02）

現行実装のコード監査で、運用影響がある不足を1件修正済み。

- `devtask.submit` の payload 正式キーは `repository` だが、Desktop Agent 側のディレクトリ自動作成処理が `repo` のみ参照していた。
- 本修正で `repository` を優先し、後方互換として `repo` も受理する。
