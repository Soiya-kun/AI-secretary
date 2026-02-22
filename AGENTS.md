# AGENTS.md

## Repository-wide documentation policy

このリポジトリでは、ドキュメントを以下の2系統に分離して管理する。

1. **実装資料（Implementation Docs）**
   - 目的: 実装エージェントが「何を実装すればよいか」を即実行できる状態にする。
   - 要件: 曖昧語（推奨/場合により/検討）を避け、仕様・入出力・受け入れ基準を確定記述する。
   - 記載対象: API仕様、データモデル、処理フロー、エラー処理、運用上限、受け入れ基準。

2. **文脈資料（Context Docs）**
   - 目的: なぜその仕様になったか、意思決定の背景、会話由来の制約を保全する。
   - 記載対象: ユーザー要望履歴、判断理由、却下案、未採用案。

## File placement rules

- 実装資料は `docs/implementation-plan-ja.md` と `docs/ai-secretary-architecture-ja.md` に集約する。
- 文脈資料は `docs/context-notes-ja.md` に集約する。
- 追加質問は `docs/open-questions-ja.md` に最小限のみ残す。

## Writing rules

- 実装資料には、背景説明や会話経緯を入れない。
- 文脈資料には、実装手順を入れない（参照リンクのみ可）。
- 新規変更時は、実装資料と文脈資料の差分整合を必ず確認する。
