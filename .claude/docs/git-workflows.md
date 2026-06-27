# Git Workflows

How to isolate work in this repo — **feature branches (the default)** vs. **git worktrees** (for
parallel work) — with the exact commands start-to-finish and the Node-specific gotchas. Read this
before creating a worktree or asking where a change should live.

---

## TL;DR — which to use

| Approach | Gives a second folder? | Shares one repo/history? | `node_modules` | Use when |
|---|---|---|---|---|
| **Feature branch** | ❌ same folder; files swap on `switch` | yes | one, shared | **Default.** Solo, one task at a time |
| **Worktree** | ✅ extra folder (any path/name) | yes (one `.git`) | **its own — not shared** | You need 2+ branches checked out at once (e.g. parallel AI agents, hotfix during a feature) |
| **Separate clone** | ✅ fully independent copy | no (separate `.git`) | its own (`npm install`) | You need total isolation (different deps, run both at once) — rare |

> A *branch* never gives you a second folder — that's the whole trade-off (one working directory,
> one branch at a time). The thing people mean by "a branch in its own folder" **is a worktree**.

**Naming/location rules**
- Branch names are **unique per repo**; folder names are **independent** of branch names.
- The **same branch can't be checked out in two worktrees** at once.
- A worktree folder can live **anywhere** with **any name** — it is not required to sit in
  `.claude/worktrees/`.
- To rename an existing worktree folder use `git worktree move <old> <new>` (don't rename in the OS
  file explorer — git tracks the path).
- Worktrees are **purely local**. GitHub has no concept of worktrees, only branches — there is
  nothing to "delete from GitHub" for a worktree.

---

## Workflow A — Feature branch (DEFAULT)

One checkout, simplest, diffs show in your normal editor window.

```bash
cd D:/Github/ARV-DATA-PROJECT
git switch main && git pull            # start from fresh main
git switch -c feat/<name>              # create + switch (same as: git checkout -b feat/<name>)

# ...work...
git status
git add -A
git commit -m "Describe the change"
git push -u origin feat/<name>         # first push creates the remote branch + sets upstream
# ...more commits... then just: git push

git diff main...HEAD                   # review the whole branch vs main
gh pr create --base main --head feat/<name>   # optional PR

git switch main                        # leave the feature (files swap back to main's version)
git switch feat/<name>                 # resume later — it's all still there

# after it's merged:
git branch -d feat/<name>              # delete local branch
git push origin --delete feat/<name>   # delete remote branch
```

---

## Workflow B — Worktree (parallel work / multiple agents)

A second folder where another branch is checked out, sharing this one repo's history.

```bash
# --- create (run from the main checkout) ---
cd D:/Github/ARV-DATA-PROJECT
git switch main && git pull
git worktree add D:/Github/arv-<feature> -b feat/<feature>     # new folder + new branch off main
#   └─ the -b creates the branch AT creation; it is a real branch the whole time.
#      (folder name and branch name are independent — name the folder whatever is clear.)

# --- set up Node deps (worktrees do NOT share node_modules — see gotcha) ---
cd D:/Github/arv-<feature>
npm install                            # OR junction it (see gotcha) to reuse the main node_modules

# --- work ---
git add -A
git commit -m "Describe the change"
git push -u origin feat/<feature>
git diff main...HEAD

# --- clean up the FOLDER when done (the branch + commits persist!) ---
cd D:/Github/ARV-DATA-PROJECT
git worktree remove D:/Github/arv-<feature>   # removes the folder only; feat/<feature> stays
git worktree prune
git switch feat/<feature>                      # the branch is still here to check out / merge
```

**Project convention (historical):** earlier worktrees were created under
`.claude/worktrees/<feature>` on branch `worktree-<feature>`, with `.claude/worktrees/` added to
`.git/info/exclude` (local-only) so the nested folder didn't pollute the main repo's `git status`.
This still works, but a worktree can live anywhere — prefer a sibling folder with a clear feature
name and a normal `feat/<name>` branch.

---

## Workflow C — Separate clone (rare)

Fully independent copy with its own `.git` and `node_modules`. Use only when you need real
isolation.

```bash
cd D:/Github
git clone https://github.com/NeilARV/ARV-DATA-PROJECT.git arv-<feature>
cd arv-<feature>
git switch -c feat/<feature>
npm install
# ...same add / commit / push as Workflow A...
```

---

## Node/JS gotchas (this is a Vite + Express project)

- **Worktrees don't share `node_modules`.** It's in the working directory and is gitignored, so a
  fresh worktree has none — `npm run check` / `dev` / `tsc` fail until you provide it. Two options:
  - `npm install` inside the worktree (simple; costs disk + time), **or**
  - **junction it** to the main repo's `node_modules` (Windows, no admin, same drive):
    ```powershell
    New-Item -ItemType Junction -Path "D:\Github\arv-<feature>\node_modules" `
      -Target "D:\Github\ARV-DATA-PROJECT\node_modules"
    ```
    Fast, but a junction **must be removed before `git worktree remove`**, or removal jams. Unlink
    it (link only — does not touch the target) first:
    ```powershell
    cmd /c rmdir "D:\Github\arv-<feature>\node_modules"
    ```
- **No `.env` in a fresh worktree** (gitignored). `npm run dev`, DB scripts, and migrations need it.
  Either copy the env in, or run DB-touching commands (`db:push`, backfills, seeds) from the **main
  checkout** which already has `.env`. Never read or print `.env` contents (see CLAUDE.md security
  rules).
- **Never `db:push` to "fix" unrelated drift** — it can prompt to drop tables. Use a targeted
  `ALTER`/`CREATE INDEX` for additive schema changes and apply it from the main checkout.

---

## Seeing diffs

- In a worktree/branch folder: `git diff` (unstaged), `git diff --staged`, `git diff main...HEAD`
  (the whole branch vs main).
- In VS Code, the Source Control panel shows the diff for **whichever folder you have open** — open
  the worktree folder to see its changes (the main-repo window won't show them; it's a different
  folder).
- On GitHub: push the branch and open a compare/PR (`main...feat/<name>`, the "Files changed" tab).

---

## For Claude / agents

- **Default to Workflow A** (a `feat/<name>` branch in the main checkout). Only use a **worktree**
  when the user explicitly asks, or when running **multiple agents in parallel** on different
  branches.
- **Commit/push only when the user asks.** If you're on `main` (the default branch), create a
  branch first.
- A worktree is **disposable**: once its work is committed (and pushed) to its branch, the branch
  persists independently — remove the worktree folder (`git worktree remove`, after unlinking any
  `node_modules` junction) and the branch stays, checkout-able from the main repo.
- End commit messages with the `Co-Authored-By` trailer; end PR bodies with the Claude Code line
  (see the global tooling conventions).
