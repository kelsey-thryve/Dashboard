# Business Dashboard

A personal dashboard for running the business day to day: to-dos, revenue,
expenses, a sales pipeline, client boards, ideas, key links, and an Agents
tab that monitors Claude agents working on the business.

No server, no account, no build step. Everything is a single static site.
Your day-to-day editing lives in your browser's `localStorage`. `data.json`
and `agents-log.json` are a separate, committed copy of that shape that
Claude agents read for business context and write updates/activity to — see
**Agents** below. This repo (and therefore those two files) is public, so
treat anything you let agents sync there as public information.

## Running it

Just open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Opening `index.html` directly by double-clicking it also works — the app
doesn't fetch anything external.)

## What's inside

- **Home** — the day at a glance: revenue/expense progress, open tasks,
  prospects waiting on a follow-up. The revenue/expense portion has a month
  switcher (‹ August 2026 › · Today) shared with the Revenue and Expenses
  tabs — step back to review any past month, everywhere it appears at once.
  Open tasks and follow-ups are always current, regardless of the month
  you're viewing.
- **To-Do** — add and remove tasks, with an optional due date (editable any
  time via the pencil icon — it turns red once it's passed and the task is
  still open). Check "Repeats weekly" on a task and it automatically resets
  to open every week once you've checked it off, instead of needing to be
  recreated. Tasks can optionally be tied to a client.
- **Time tracking** — click the clock icon on any to-do to log time against
  it: hours/minutes, a date, and an optional note on what you did. A task
  with logged time shows a running total chip; a client's task board totals
  up all the time logged across their tasks. Since it's attached to to-dos,
  untie it from a client at any point just by leaving the task unassigned.
- **Revenue** — set your monthly goal (defaults to $10,000), log income by
  client/source, see a progress meter and a breakdown chart for the current
  month. Tick "Expected" on an entry to log it as a potential incoming rather
  than money in hand — it shows up in its own "Potential incomings" list and
  doesn't count toward the goal meter until you tick it back to received.
- **Expenses** — same pattern, with a monthly budget (defaults to $1,000).
  The meter turns red if you go over. Each expense can be tagged with a
  category and marked "Includes GST"; the GST rate is editable (defaults to
  10%), and the tab shows an estimated GST-reclaimable total for the month.
  That's a starting estimate for your own tracking — some categories (like
  entertainment) may not be fully claimable, so confirm with your
  accountant/bookkeeper before lodging anything.
- **Sales** — a four-column pipeline: Prospects → Reached out → Follow-up →
  Meeting. New entries start in "Prospects" with just a name and notes;
  clicking "Move to Reached out" is what stamps the reached-out date and
  starts the follow-up clock. Any prospect still sitting in "Reached out"
  after 7 days is flagged in the UI and on the Home banner. Click "Enable
  follow-up notifications" to also get a browser notification — this only
  fires while the dashboard tab is open (there's no background server), so
  it's a nice-to-have on top of the in-app flag, not a replacement for it.
- **Clients** — each client gets its own mini task board. Tasks added there
  use the same underlying list as the main To-Do tab, so they show up in
  both places automatically; the main To-Do tab can also be filtered to a
  single client. Two more things live on each client's board:
  - **Context for agents** — a free-text brief (brand voice, goals,
    deliverables, constraints, links…), separate from the short one-line
    notes next to the client's name. This is plain text, so it flows through
    the same export/sync path as the rest of your data into `data.json` —
    which means it's readable by the Thryve agents, **and** since this repo
    is public, it's public. Don't put anything in it you wouldn't want
    visible to anyone with the repo link.
  - **Documents** — upload onboarding forms, briefs, contracts, whatever a
    client needs on file. These are stored locally in the browser's
    IndexedDB, not in `localStorage` (files are too big for that) and not in
    the git repo — so they're private to this browser/device, survive a
    reload, but **are not exported in the Data → Export JSON backup and are
    not visible to any agent.** There's no path in this app for getting a
    file's contents to a remote Claude session; if an agent needs to see
    what's in a document, share it with that agent directly in its own chat,
    or paste the relevant details into that client's Context field instead.
- **Ideas** — a running scratch list.
- **Key Links** — frequently used sites, one click away.
- **Editing** — every list (To-Do, Revenue, Expenses, Sales, Clients, Ideas,
  Key Links) has a pencil icon next to each entry to edit it in place, not
  just add/remove.

## Agents

The **Agents** tab shows six Claude personas set up for this business — Sales,
Email Campaigns, Website, Analytics, Design, and an Ops Overseer — each
invoked on demand (e.g. "sales agent, draft outreach to X"). Their
definitions live outside this repo, at `~/.claude/agents/thryve-*.md` on
Kelsey's machine.

When an agent does something worth tracking, it appends an entry to
`agents-log.json` (`{timestamp, agent, summary}`) and commits/pushes it here,
which is what the Agents tab's activity feed reads. `data.json` is the
business-data copy agents read for context (clients, pipeline, revenue,
todos) — it's seeded empty and gets synced from an export of the live
dashboard data on request.

## Backing up your data

Since everything lives in this browser's local storage, it can be lost if you
clear browsing data or switch machines. Use the **Data** button in the
sidebar to export a JSON backup or import one back in.
