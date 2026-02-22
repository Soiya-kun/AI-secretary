# AI秘書アーキテクチャ仕様（確定版 v1.0）

## 1. システム目的

- Windowsデスクトップ上で常駐するAI秘書エージェントを提供する。
- エージェントは skills を自発実行し、Google Meet参加、議事録作成、要約更新、音声応答を実行する。
- 議事録・要約は Markdown として Git 管理する。

## 2. 固定前提

1. OSは **Windowsのみ**。
2. スマホ操作は **Web UI**。
3. スマホからの経路は **初期からインターネット越し対応**。
4. クラウド構成は **AWS API Gateway + Lambda + Cognito + DynamoDB**。
5. インフラは **TypeScript CDK** で管理し、desktop設定を含む **モノレポ** で管理。
6. orchestrator は **Claude Code**。
7. skill変更は **hot reload** で即時反映。
8. システムリトライ上限は **最大3回**。
9. Claude orchestrator 障害時の Codex/Gemini 自動フォールバックは **実装しない**。
10. 会話継続モードの無音タイムアウトは **20秒**。
11. Meet返答音声は **OS既定の仮想マイク経由**。
12. raw音声は永続保存しない。障害解析目的で **最大5分の一時保存** を許可。
13. 高リスク操作でも確認ダイアログを挟まない（YOLOモード）。
14. `devtask.submit` の対象ディレクトリが無い場合は自動作成する。
15. Mobile Web UI初期権限は単一ロール（全コマンド許可）。
16. Git同期失敗時の第一通知チャネルはメール。

## 3. 論理構成

```text
[Desktop Agent (Electron + Node)]
  ├─ Agent Runtime
  ├─ Skill Orchestrator (Claude Code)
  ├─ Skill Runners (Codex/Gemini/Claude CLI)
  ├─ Meeting Module (join/share)
  ├─ Audio Module (capture/stt/tts/virtual-mic)
  ├─ Notes Module (markdown/git export)
  ├─ Remote Gateway Client
  ├─ Policy & Retry Controller
  └─ Audit Logger

[AWS Remote Control Plane]
  ├─ API Gateway
  ├─ Lambda (command API)
  ├─ Cognito (auth)
  └─ DynamoDB (command/state)

[Mobile Web UI]
  └─ command submit / status watch
```

## 4. 実行責務

### 4.1 Agent Runtime
- 定期ジョブ起動（会議検知、要約更新、保留再処理）。
- 外部コマンド起動（スマホWeb UI由来）。
- 優先度制御（meeting系 > devtask系）。

### 4.2 Skill Orchestrator
- orchestrator は Claude Code に固定。
- skill manifest を読み込み hot reload。
- 各実行は最大3回まで再試行。

### 4.3 Meeting操作
- `join_meet` skill で参加。
- `share_screen_meet` skill で画面共有開始。
- 画面共有は別skillとして明確に分離。

### 4.4 音声処理
- 会議音声とマイク入力を取得し STT 実行。
- 呼びかけ時に TTS を生成し、仮想マイクへ送出。
- 会話継続モードは20秒無音で終了。
- raw音声は処理後破棄。障害時のみ最大5分保持。

### 4.5 議事録/要約のGit管理
- 出力形式は Markdown 固定。
- 不明repoは `notes/inbox-notes` に保存。
- 再振分けはチャット指示で実行。
- 同期方式（直push/PR/保留）は skill定義に委譲。
- 同期失敗時はメール通知を必須送信。

## 5. スマホ指示経路（確定）

```text
Mobile Web UI
 -> API Gateway
 -> Lambda(Command API)
 -> DynamoDB(command queued)
 -> Desktop polling/stream client
 -> Agent Runtime
 -> Skill execution
 -> Result writeback (DynamoDB)
 -> Web UI status update
```

- 認証: Cognito OIDC。
- APIはTLS必須。
- コマンドは `command_id` で追跡。

## 6. コマンド種別

- `assistant.ask`
- `meeting.join.now`
- `meeting.share_screen.start`
- `devtask.submit`
- `job.cancel`

## 7. 議事録フォーマット（固定）

1. 会議目的
2. 主要論点
3. 決定事項
4. ToDo
5. 懸念/リスク
6. 保留事項
7. 追加メモ

## 8. 監査要件

- 全コマンドに監査IDを付与。
- 実行者、時刻、skill名、結果、再試行回数を保存。
- YOLOモードでも監査ログ省略は禁止。

## 9. Claude主軸の自律エージェント構成（追加確定）

### 9.1 実行モデル
- Claude Code を supervisor とし、常時1セッションを維持する。
- Codex CLI / Gemini CLI は supervisor が起動要求する worker として動作する。
- Desktop Agent は supervisor / worker のプロセスライフサイクルを管理する。

### 9.2 プロセス構成
```text
[Desktop Agent]
  ├─ Supervisor Process (Claude Code) [always-on]
  ├─ Worker Pool: Codex CLI (max 2)
  ├─ Worker Pool: Gemini CLI (max 2)
  ├─ Skill Registry (hot reload manifest)
  ├─ Command Router (remote/local/scheduled)
  └─ Audit Logger
```

### 9.3 ルーティング規則
- 全 command は `commandType` をキーとして supervisor に渡す。
- supervisor は skill 定義を参照して worker 起動計画を返す。
- Agent は計画に従って worker を実行し、結果を supervisor へ返却する。

### 9.4 整合制約
- Cloud API / Mobile Web / Desktop Runtime の `commandType` は完全一致させる。
- command payload は commandType単位で単一schemaを持ち、別名キーを禁止する。
- 未定義 commandType は reject し、監査ログへ `unsupported_command` を保存する。
