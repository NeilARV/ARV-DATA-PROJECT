# Agent Updater

## Overview
The agent updater is used to make adjustments based on code changes made. The goal is to ensure that agents have up to date information so the app stays organized.

## Requirements
- You HAVE TO reference this document AFTER making changes to any code or features to determine if 
- You MUST request my approval for ALL changes you want to make to any agent files

## Agent File List
- `access-control.md` - access control based on authentication, roles and subscription tiers
- `agent-updater.md` - workflow/instructions
- `code-review.md` - workflow/instructions
- `code-standards.md` - instructions
- `data.md` - app
- `deals.md` - app
- `design.md` - design
- `email-settings.md` - feature
- `testing.md` - workflow/instructions
- `vendors.md` - app

## Example
1. Deals currently only support `agent`, `wholesale` and `sold` status types. If I asked to implement a new status called `unknown`, then `deals.md` would need to be updated to show this change.

2. If I simply asked to increase the status tag to make it more visible, the status tag appears in more than one area so we would likely change `design.md` to reflect this change

3. No agent files need to be changed if no significant or global update was made that changed instructions, workflows, apps or designs. (ie. the font size of a specific component contained only in vendors does not need to change the design file)