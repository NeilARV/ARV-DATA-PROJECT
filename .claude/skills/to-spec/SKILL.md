---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary are configured in `.claude/skills/project-setup/` — read the **Active configuration** block in its `SKILL.md` for the active tracker, then follow that tracker's `issue-tracker-*.md` and `triage-labels.md`. If it's not configured yet, run `/project-setup`.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Label it with **one category role** (`bug` / `enhancement` / `accessibility`) and the **`ready-for-agent`** state role — the spec is fully specified, so no `needs-triage` pass is needed. Resolve the canonical roles to this repo's actual label strings via `.claude/skills/project-setup/triage-labels.md`.

4. **Group the epic for at-a-glance visibility.** On a real tracker (GitHub, Linear, …), when this spec is an epic that will be broken into tickets via `/to-tickets`, also create a **milestone** named for the body of work and a **shared grouping label** (a short kebab slug of the epic, e.g. `monorepo-restructure`) in a neutral **gray** — it's organizational, not categorical, so keep it visually subordinate to the category and status labels. Apply both to the spec issue. Aim for a **milestone → category → status** reading: the milestone is its own chip, and the category label sorts before the status label. The native sub-issue link alone isn't visible from the issues list — the milestone (a progress page plus a per-row chip) and the label (a per-row chip plus one-click filter) are what make the grouping obvious at a glance. `/to-tickets` reuses this same milestone and label on every ticket it spawns, so create them with names that will read well on the tickets too. Skip this for local-markdown trackers (no milestones).

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>