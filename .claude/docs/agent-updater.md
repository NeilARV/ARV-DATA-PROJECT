# Agent Updater

## Overview
The agent updater is used to make adjustments based on code changes made.

## Goal
Ensure all agents are up-to-date so depracated code does not make it into production.

## Requirements
- You HAVE TO reference this document AFTER making changes to any code or features to determine if 
- You MUST request my approval for ALL changes you want to make to any agent files

## Agent File List
- `CLAUDE.md` - base
- `.claude/docs/access-control.md` - access control based on authentication, roles and subscription tiers
- `.claude/docs/agent-updater.md` - workflow/instructions
- `.claude/docs/code-review.md` - workflow/instructions
- `.claude/docs/code-standards.md` - instructions
- `.claude/docs/data.md` - app
- `.claude/docs/deals.md` - app
- `.claude/docs/design.md` - design
- `.claude/docs/email-settings.md` - feature
- `.claude/docs/testing.md` - workflow/instructions
- `.claude/docs/vendors.md` - app

## Permissions
On my approval, you have permission to update agents.

## Example
1. Deals currently only support `agent`, `wholesale` and `sold` status types. If I asked to implement a new status called `unknown`, then `deals.md` would need to be updated to show this change.

2. If I simply asked to increase the status tag to make it more visible, the status tag appears in more than one area so we would likely change `design.md` to reflect this change

3. No agent files need to be changed if no significant or global update was made that changed instructions, workflows, apps, designs or base. (ie. the font size of a specific component contained only in vendors does not need to change the design file)