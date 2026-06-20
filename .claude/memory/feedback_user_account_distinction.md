---
name: feedback-user-account-distinction
description: novel-writer プロジェクトでは、Claude session の system context `userEmail` (claude.ai login user) を本田様の業務アカウントと取り違えないこと。業務アカウントは hy.unimail.11@gmail.com (Phase 1 runbook §前提に明記)。
metadata:
  type: feedback
---

novel-writer プロジェクトで本田様の Google アカウント (Firebase / GCP / Cloud Run / smoke test login 用) を記述する際、Claude session の `userEmail` (system context が示す claude.ai login user の email) と混同してはならない。

**Why:**
2026-06-20 Phase 2 deploy 段階で、AC-P2-7 (Vertex AI smoke test の login 案内) を runbook + 操作依頼メッセージに書く際、Claude session の userEmail を本田様の業務アカウントと取り違えて `sanwaminamihonda@gmail.com` と記述した。本田様から「全然違う別のアカウント、`hy.unimail.11@gmail.com` が正しい」と指摘を受けた。プロジェクト CLAUDE.md (Phase 1 runbook §前提) に明記されていたにも関わらず参照を怠った事実誤認。同種の誤記が既存 doc 2 箇所 (`docs/spec/promptSafety/2026-06-04-observability-metric-counter-design.md` / `docs/runbook/cloud-logging-safety-event-metrics.md`) にもあり、過去セッションでも同じ取り違えが発生していた可能性が高い。

**How to apply:**
- 本田様の業務アカウント (Firebase / GCP / GitHub login / smoke test 用) を書くときは、**必ず Phase 1 runbook (`docs/runbook/prod-infrastructure-setup.md`) §前提**を grep / Read で確認してから書く
- 正値: `hy.unimail.11@gmail.com` (GCP / Firebase) + `yasushi-honda` (GitHub username)
- Claude session の `userEmail` (system context) は claude.ai login user の email であり、業務アカウントとは独立した別エンティティ。混同すると本田様の業務メールが docs / commit / PR に誤って書かれる
- email を含む doc / runbook / spec を新規追加するときは `grep -rn "@gmail.com" docs/` で全箇所確認し、誤記がないか cross-check
- グローバル memory `~/.claude/memory/` には書かない (プロジェクト固有な人名 / 組織情報、`feedback_project_runtime_paths.md` の分離規律)

**関連:**
- [project_novel_writer_m1](./project_novel_writer_m1.md) - M1 振り返り (Phase 1 設定値の真値ソース)
- グローバル `feedback_verify_fact_before_declaring.md` - 事実は ground truth で確認してから書く規律 (本件はこれの applied case)
