# Git Worktree Workflow Guide

This document covers the full lifecycle of using Git worktrees:

* Create a worktree
* Work inside it
* Commit changes
* Push branch
* Merge back into main
* Remove the worktree
* Delete the branch

---

## 1. Create a Worktree

Create a new branch and worktree:

```bash
git worktree add .cloud/worktree1 -b feature-x
```

What this does:

* Creates a new branch called `feature-x`
* Creates a new folder at `.cloud/worktree1`
* Checks out that branch in the new folder

Verify:

```bash
git worktree list
```

Example output:

```bash
/path/to/repo                 abc123 [main]
/path/to/repo/.cloud/worktree1 def456 [feature-x]
```

---

## 2. Work Inside the Worktree

Move into the worktree:

```bash
cd .cloud/worktree1
```

Make your code changes as normal.

Check status:

```bash
git status
```

---

## 3. Stage Changes

Stage everything:

```bash
git add .
```

Or specific files:

```bash
git add src/file.ts
```

---

## 4. Commit Changes

Commit your work:

```bash
git commit -m "Implement feature X"
```

View commit history:

```bash
git log --oneline
```

---

## 5. Push Branch

First push:

```bash
git push -u origin feature-x
```

Future pushes:

```bash
git push
```

---

## 6. Merge Into Main

Return to main repository:

```bash
cd ../..
```

Switch to main:

```bash
git checkout main
```

Pull latest:

```bash
git pull origin main
```

Merge your branch:

```bash
git merge feature-x
```

Push main:

```bash
git push origin main
```

---

## 7. Remove the Worktree

Proper removal:

```bash
git worktree remove .cloud/worktree1
```

This:

* Deletes the folder
* Removes Git’s metadata

Force remove if uncommitted:

```bash
git worktree remove --force .cloud/worktree1
```

---

## 8. Delete the Branch

Delete local branch:

```bash
git branch -d feature-x
```

Force delete:

```bash
git branch -D feature-x
```

Delete remote branch:

```bash
git push origin --delete feature-x
```

---

## If You Already Deleted the Folder Manually

If you deleted the folder yourself:

```bash
git worktree prune
```

This removes stale metadata.

Then delete the branch:

```bash
git branch -d feature-x
```

---

## Full Example Workflow

```bash
# Create
git worktree add .cloud/worktree1 -b feature-x

# Work
cd .cloud/worktree1
git add .
git commit -m "Add feature"
git push -u origin feature-x

# Merge
cd ../..
git checkout main
git pull
git merge feature-x
git push

# Cleanup
git worktree remove .cloud/worktree1
git branch -d feature-x
git push origin --delete feature-x
```

---

## Quick Rules

Use:

* `git worktree add` → create
* `git worktree list` → view
* `git worktree remove` → delete properly
* `git worktree prune` → cleanup stale entries
* `git branch -d` → remove merged branches

Best practice:
**Never manually delete a worktree folder unless necessary.**
Always use:

```bash
git worktree remove <path>
```
