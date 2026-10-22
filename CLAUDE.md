# Thryve Growth workspace

This repo is Kelsey McCree's business dashboard for Thryve Growth. Claude reads this file at the start of every session opened here, cloud or local.

## First, before replying to Kelsey

Load **Thryve OS**, the shared memory for the business. It lives in the private Thryve Growth shared drive (Google Drive), folder "Thryve OS":

- `00 Start here.md`, Drive file ID `1u1rk0pqi3na27AdJGmkXQBbDGmzGJTmQ`. Read it with the Google Drive connector. On Kelsey's Mac it may already be loaded through `~/.claude/CLAUDE.md`, in which case don't read it again.
- It lists everything else: client files (`Thryve OS/Clients/`), `Sales and pitches.md` and `Systems.md`. Read those when the task needs them.

Kelsey shouldn't have to ask for this. Do it quietly at the start of the session, then answer her.

## House rules (full list in Start here)

- Never use em dashes in anything you write.
- Drafts only: don't send emails, contact prospects, post, publish or change live ads without Kelsey's explicit OK.
- Don't merge pull requests without her go-ahead.
- **This repo is public.** No client names, contact details, money figures or private client detail in commits. That belongs in Thryve OS.

## This repo

- `index.html`, `app.js`, `style.css`: the dashboard (a static site).
- `data.json`, `agents-log.json`: a synced copy of the dashboard data that agents read and write. Keep agent log summaries generic.
- `inbox/*.json`: to-dos and pipeline updates the dashboard imports on load (shape documented in Thryve OS `Systems.md`).
- `.claude/agents/`: the six Thryve agents (sales, email campaigns, website, analytics, design, ops overseer). They read Thryve OS before any task.
- From a local clone: `git pull` before changing anything, then commit and `git push` when done.
