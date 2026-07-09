---
name: project-setup
description: Configure this repo for the engineering skills — set the issue tracker and confirm the triage label vocabulary. Run once before first use of to-spec, to-tickets, triage, or wayfinder.
disable-model-invocation: true
---

# Project Setup

Configure the two things the engineering skills (`/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`) assume about this repo:

- **Issue tracker** — where issues and PRDs live (GitHub via the `gh` CLI, or local markdown under `.scratch/`).
- **Triage labels** — the label strings this repo uses for the five canonical triage roles.

The chosen tracker is recorded in the **Active configuration** block below; the engineering skills read it to know which `issue-tracker-*.md` file to follow. This is a prompt-driven skill, not a deterministic script — explore, present what you found, confirm with the user, then write.

## Active configuration

<!-- This block is the single source of truth the engineering skills read. Keep it current when the tracker changes. -->

- **Active tracker:** GitHub — follow [issue-tracker-github.md](./issue-tracker-github.md).
- **Triage labels:** see [triage-labels.md](./triage-labels.md).

(To switch to local markdown, re-run this skill or set the line above to `Local markdown — follow [issue-tracker-local.md](./issue-tracker-local.md).`)

## Config files

- [issue-tracker-github.md](./issue-tracker-github.md) — GitHub issue-tracker conventions (`gh` CLI, wayfinding ops).
- [issue-tracker-local.md](./issue-tracker-local.md) — local-markdown conventions (`.scratch/` files).
- [triage-labels.md](./triage-labels.md) — canonical role → repo label mapping.

## Process

### 1. Explore

Read the repo's starting state — don't assume:

- `git remote -v` — is this a GitHub repo? Which one?
- `.scratch/` — sign that a local-markdown tracker convention is already in use.
- The **Active configuration** block above — is a tracker already recorded?

### 2. Present findings and ask

Summarise what's present, then walk the two decisions **one at a time** — present a section, get the answer, then move on. Assume the user doesn't know the terms; each section starts with a short explainer.

**Section A — Issue tracker.**

> Explainer: The "issue tracker" is where issues and PRDs live. `/to-spec`, `/to-tickets`, `/triage`, and `/wayfinder` read from and write to it — they need to know whether to call `gh issue create` or write a markdown file under `.scratch/`.

If a `git remote` points at GitHub, propose GitHub. Otherwise offer:

- **GitHub** — issues live in the repo's GitHub Issues (uses the `gh` CLI). See [issue-tracker-github.md](./issue-tracker-github.md).
- **Local markdown** — issues live as files under `.scratch/<feature>/` (good for solo work or repos without a remote). See [issue-tracker-local.md](./issue-tracker-local.md).

If — and only if — the user picked **GitHub**, ask one follow-up:

> Explainer: Open-source repos often receive feature requests as pull requests, not just issues — a PR is an issue with attached code. If you turn this on, `/triage` pulls *external* PRs into the same queue and runs them through the same labels and states.

- **PRs as a request surface** — yes / no (default: no). Record the answer in [issue-tracker-github.md](./issue-tracker-github.md). Local markdown has no PRs — skip this question.

**Section B — Triage label vocabulary.**

> Explainer: When `/triage` processes an issue, it moves it through a state machine and applies labels. Those labels must match strings you've actually configured. If this repo already uses different label names (e.g. `bug:triage` instead of `needs-triage`), map them here so the skill applies the right ones.

The five canonical roles (defaults equal their names):

- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter
- `ready-for-agent` — fully specified, AFK-ready
- `ready-for-human` — needs human implementation
- `wontfix` — will not be actioned

Ask whether to override any. If the tracker has no existing labels, the defaults are fine.

### 3. Confirm and write

Show the user a draft of the changes, let them edit, then write:

- Set the **Active configuration** block above to the chosen tracker.
- Update [triage-labels.md](./triage-labels.md) if any label was overridden.
- Set the PRs-as-a-request-surface flag in [issue-tracker-github.md](./issue-tracker-github.md) if GitHub was chosen.

### 4. Done

Tell the user setup is complete: `/to-spec`, `/to-tickets`, `/triage`, and `/wayfinder` now read the **Active configuration** block to know which tracker to use. Mention they can edit these files directly later — re-running this skill is only needed to switch trackers or restart from scratch.
