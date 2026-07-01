---
description: Create a git worktree in the canonical location on a consistent feat/ branch with an auto-assigned dev port, then implement the given prompt inside it. For spinning up parallel, isolated work (a plan, a change, or /hunt fixes) without disturbing the main checkout.
argument-hint: "<prompt-or-plan> [name:<slug>]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Bash(ln:*), Bash(ls:*), Bash(find:*), Bash(lsof:*), Bash(grep:*), Bash(npm:*), Bash(cat:*), Bash(mkdir:*), Bash(rm:*), Bash(pwd:*)
---

# /worktree — Spin up an isolated worktree and build in it

You create a **git worktree** in this project's canonical location, on a consistent branch, with a
**collision-free dev port**, and then **implement the requested work inside that worktree** — never
in the main checkout. This exists so parallel work (a designed plan, a feature, or a batch of
`/hunt` fixes) lands in a predictable place with predictable ports, instead of scattered folders.

Follow the steps **in order**. The single most important invariant: **once the worktree exists,
every file read/edit/write and every command runs against the worktree path — never the main
checkout.** Mixing the two is the one failure that makes this command worse than useless.

Raw arguments: `$ARGUMENTS`

---

## Step 1 — Parse arguments

`$ARGUMENTS` is the **task to implement in the new worktree** (a plan, a change request, or pasted
`/hunt` findings to fix). Extract:

- **The task prompt** — everything that isn't the optional `name:` token. This is what you build.
- **`name:<slug>`** (optional) — an explicit kebab-case feature name. If absent, **derive** a short,
  descriptive kebab-case slug from the task (2–4 words, e.g. `deal-offer-validation`). No spaces,
  lowercase, `feat/` is added automatically — do not include it in the slug.

If the task prompt is empty (only a name, or nothing), stop and ask what to build.

---

## Step 2 — Capture the main checkout and preconditions

Run these from the current directory (the main checkout) **before** creating anything:

```bash
MAIN_ROOT="$(git rev-parse --show-toplevel)"
echo "main: $MAIN_ROOT"
git -C "$MAIN_ROOT" worktree list
```

- `MAIN_ROOT` is the anchor for **every** absolute path below and both symlink targets. Capture it
  now, because `git rev-parse --show-toplevel` returns the *worktree's* path once you're inside one.
- If `$MAIN_ROOT` is itself a worktree (path contains `/.claude/worktrees/`), stop — run this from
  the real main checkout, not from inside another worktree.
- The canonical worktree home is `"$MAIN_ROOT/.claude/worktrees"`. It is already in
  `.git/info/exclude`, so worktrees never pollute the main repo's `git status`. Create the dir if
  missing: `mkdir -p "$MAIN_ROOT/.claude/worktrees"`.

Do **not** switch branches or pull in the main checkout (that would disturb whatever the user is
doing there). You will branch off the `main` **ref** directly, which needs no checkout switch.

---

## Step 3 — Resolve the name and guard against collisions

Let `NAME` = the slug from Step 1 and `WT="$MAIN_ROOT/.claude/worktrees/$NAME"`.

```bash
ls -d "$WT" 2>/dev/null && echo "FOLDER EXISTS"
git -C "$MAIN_ROOT" branch --list "feat/$NAME"
```

- If the folder already exists **or** `feat/$NAME` already exists: stop and report it. Offer to
  either pick a different `name:` or (if the user confirms) resume work in the existing worktree
  instead of recreating it. Never clobber an existing worktree.

---

## Step 4 — Compute the dev port (base 4001, collision-free)

The main checkout runs on port **4000** (`process.env.PORT || '4000'`). Worktrees start at **4001**
and climb. Two worktrees must never share a port. Pick the **lowest free port ≥ 4001** that is
neither recorded by another worktree nor currently listening:

```bash
WT_HOME="$MAIN_ROOT/.claude/worktrees"
PORT=4001
while :; do
  if grep -rqsx "$PORT" "$WT_HOME"/*/.worktree-port 2>/dev/null; then PORT=$((PORT+1)); continue; fi
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1;   then PORT=$((PORT+1)); continue; fi
  break
done
echo "assigned port: $PORT"
```

This yields 4001 for the first worktree, 4002 for the second, and so on — and, because it skips
ports already recorded or in use, it stays correct even after a worktree is removed and another is
added (no silent reuse of a live port).

---

## Step 5 — Create the worktree

```bash
git -C "$MAIN_ROOT" worktree add "$WT" -b "feat/$NAME" main
```

- `-b feat/$NAME` creates the branch **at** creation, off the local `main` ref, without touching the
  main checkout's current branch.
- If this errors (e.g. `main` not found, or the branch raced into existence), stop and report the
  exact git error — do not guess or retry with a different base.

If you want the branch off the very latest remote main, you may `git -C "$MAIN_ROOT" fetch origin`
first and use `origin/main` as the base — but only mention this; default to local `main`.

---

## Step 6 — Wire up node_modules, .env, and the port marker

A fresh worktree has **no `node_modules` and no `.env`** (both gitignored). Symlink both from main so
`npm run check` / `dev` / DB scripts work immediately, and drop the port marker:

```bash
ln -s "$MAIN_ROOT/node_modules" "$WT/node_modules"
ln -s "$MAIN_ROOT/.env"         "$WT/.env"
printf '%s\n' "$PORT" > "$WT/.worktree-port"
ls -la "$WT/node_modules" "$WT/.env" "$WT/.worktree-port"
```

- These are **symlinks, not copies** — you are never reading, printing, or `cat`-ing `.env`
  contents (see CLAUDE.md → Security Rules / `ARV.SECRET-ACCESS`). Creating the link is fine;
  displaying the file's contents is not. Never do the latter.
- The `.worktree-port` marker is what Step 4 reads to avoid port collisions next time. It is
  untracked and harmless; leave it in place for the life of the worktree.
- If symlinking `node_modules` is undesirable on a given machine, `cd "$WT" && npm install` is the
  fallback — but the symlink is the default (instant, no disk cost).

---

## Step 7 — Implement the task **inside the worktree**

Now build what Step 1 asked for. **All paths are under `$WT`.** Before editing, obey CLAUDE.md: read
the relevant standards (`.claude/docs/standards/{typescript,react,express}.md`), the app section in
`.claude/docs/apps.md`, and `access-control.md` if you touch auth — exactly as you would for any
change. The only difference is the working directory.

- Read and edit files at `"$WT/<path>"`, not at `"$MAIN_ROOT/<path>"`. Double-check every edit target
  begins with the worktree path.
- When the task is pasted `/hunt` findings, fix each finding at the cited `path:line` **within the
  worktree**.
- Do **not** commit or push unless the user explicitly asked — leave the changes in the worktree.
- When done, type-check in the worktree:

```bash
cd "$WT" && npm run check
```

Fix any type errors before reporting done.

---

## Step 8 — Report

Emit exactly this structure:

````markdown
# Worktree Ready — `feat/<NAME>`
**Location:** `.claude/worktrees/<NAME>`
**Branch:** `feat/<NAME>` (off `main`)
**Dev port:** <PORT>  → `cd .claude/worktrees/<NAME> && PORT=<PORT> npm run dev`

## What I built
<2–5 lines: the change, the files touched (as worktree-relative paths), and `npm run check` result.>

## Next steps
- Run it:      `cd .claude/worktrees/<NAME> && PORT=<PORT> npm run dev`  → http://localhost:<PORT>
- Review:      `git -C .claude/worktrees/<NAME> diff main...HEAD`
- Commit:      from the worktree, `git add -A && git commit -m "..."` (only when you're ready)
- Clean up:    `git worktree remove .claude/worktrees/<NAME>` then `git worktree prune`
               (the `feat/<NAME>` branch persists after the folder is removed)
````

Keep it short. Do not restate these steps as prose elsewhere; the block above is the whole report.

Begin with Step 1.