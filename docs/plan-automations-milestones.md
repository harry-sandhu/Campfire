# Plan: milestones polish, automations, webhook upgrades

Status: built, except the optional drag-and-drop canvas (Phase 3, item 2), which we skip until the form builder shows real use.

Built: milestone progress, overdue and due-soon badges, milestone detail, bulk "add to milestone" and the due-soon alert; the per-person overview (Reports → People); the automations engine, API, recipes and form builder; webhook delivery history, auto-pause, secret rotation, editable format, resend and a Slack guide. Email actions are left for when email is set up.

## Where we are

- **Milestones** (`backend/src/routes/milestones.ts`, group page tab): name, description, due date, open/closed, a `done / total` count. Managed by leaders and creators.
- **Webhooks** (`backend/src/routes/webhooks.ts`, `services/webhooks.ts`): per group, https only, SSRF-checked, HMAC-signed, 2 retries, `json` or `slack` format, last status only.
- **Event bus** (`services/events.ts`): `publish`/`subscribe` of ticket and comment events. Webhooks and realtime already subscribe. Automations will too.
- **Timer** (`server.ts`): a 5-minute tick already runs recurring tickets. Time-based automations can use it.

## Phase 1 — Milestone polish (small, ship first)

| # | Item | Notes |
|---|------|-------|
| 1 | Progress bar and percentage | Frontend only. Data already returned (`total`, `done`). |
| 2 | Overdue and due-soon badges | Frontend only. Compare `dueDate` to now, ignore closed milestones. |
| 3 | Bulk "Add to milestone" on the tickets page | New bulk action `milestone` in `routes/tickets.ts`. Reuse `validatePlacement` so milestone must match the ticket's group. Only offered when one group is selected. |
| 4 | Milestone detail view | Tickets of one milestone grouped by status. Reuses `GET /tickets?groupId=&milestoneId=`. |
| 5 | Due-soon notification | Daily check on the existing timer: notify group leaders of milestones due within 3 days and not closed. Dedupe so it fires once. |

Done when: progress and overdue show on the group Milestones tab, bulk attach works with a test, and the notification fires once per milestone.

## Phase 2 — Automations engine (recipes first)

### Data model: `Automation`
- `groupId`, `createdById`, `name`, `active`
- `trigger`: `{ type, ...params }`. Types: `ticket.created`, `ticket.status_changed`, `ticket.assigned`, `ticket.priority_changed`, `comment.created`, `ticket.overdue`, `ticket.stuck` (in a status for N days), `milestone.completed`.
- `conditions`: list of `{ field, op, value }` over priority, status, assignee (including "nobody"), topic.
- `actions`: list of `{ type, ...params }`. Types: `notify_user`, `notify_leaders`, `post_slack` (uses a group webhook), `assign`, `set_priority`, `set_status`, `set_milestone`, `add_comment`.
- `lastRunAt`, `runCount`, `failCount`.

### Run log: `AutomationRun`
`automationId`, `ticketId`, `ok`, `error`, `at`. TTL index so it expires after 30 days. Shown in the UI as "ran 12 times, 1 failed" plus a recent-runs list.

### Engine: `services/automations.ts`
- Subscribe to the event bus. For each event, load active automations for that group and match trigger and conditions.
- Run actions through the existing `updateTicket` and `createTicket` services, so validation, activity log, notifications and webhooks all behave as normal.
- **Actor:** actions run as a system actor. Activity entries read "Automation: <name>".
- **Loop protection:** carry an `automationDepth` on events produced by automations. Stop at depth 3, and never let a rule re-trigger itself for the same ticket in the same run.
- **Failure isolation:** an error in one action is logged to `AutomationRun` and does not stop other automations.
- **Time-based triggers** (`overdue`, `stuck`): scan on the existing 5-minute tick. Claim each ticket with a compare-and-set marker so a rule fires once per ticket.
- **Limits:** at most 20 automations per group and 5 actions per rule.

### API: `/groups/:id/automations`
CRUD, enable/disable, `GET .../runs`, and `POST .../:id/test` (dry run against a chosen ticket, nothing changed). Leaders, creators and SuperAdmin only. Audit-log create and delete like webhooks.

### Recipes (the "drag and drop" starting point)
A gallery of ready-made rules the user picks, fills one or two blanks, and turns on:
1. Urgent ticket created → notify leaders.
2. Urgent ticket created → post to Slack.
3. Ticket blocked for 3 days → comment and notify leaders.
4. Ticket moved to In Review → assign to a chosen reviewer.
5. Ticket overdue → notify assignees.
6. All tickets in a milestone done → close the milestone and post to Slack.
7. New ticket with no assignee → assign to a chosen person.

Recipes are plain data (`frontend/lib/automation-recipes.ts`) that fill the same `Automation` shape. No separate code path.

### UI
- New **Automations** tab on the group page, visible to managers.
- Recipe gallery, list with on/off switch and run stats, run history drawer.
- Phase 3 replaces the form with a builder. The data model does not change.

### Tests
- Engine unit tests: trigger match, conditions, each action, loop cap, failure isolation.
- Permission tests: only managers can create, members cannot see rules.
- Time-based: fires once per ticket, not on every tick.
- Add the new routes to `openapi.ts` (a drift test already checks this).

## Phase 3 — Builder UI

1. **Form builder:** When / If / Then rows with dropdowns, add and remove steps.
2. **Visual canvas (optional, last):** drag blocks from a palette, snap them into When → If → Then. Only if recipes and the form show real usage. Needs keyboard and touch support, so budget more time here than the look suggests.

## Phase 4 — Webhook upgrades

| Item | Notes |
|------|-------|
| Delivery history | New `WebhookDelivery` collection with TTL: event, status, duration, error. Drawer on the Integrations tab. |
| Auto-disable | After 10 consecutive failures set `active=false` and notify leaders. |
| Secret rotation | `POST .../:id/rotate-secret` returns the new secret once. |
| Edit format | Allow `format` in the PATCH schema. |
| Connect Slack guide | Step-by-step panel with a Test button. A full Slack OAuth app is out of scope for now. |
| Resend | Retry one failed delivery from history. |

## Suggested order and rough size

1. Phase 1 — about 1 day. Phase 1b (people overview) — about 1–2 days, can follow right after.
2. Phase 2 engine, API, recipes and tests — about 3–4 days.
3. Phase 4 delivery history and auto-disable — about 1 day. Can go in parallel with 2.
4. Phase 3 form builder — about 2 days. Canvas — a week or more, only if needed.

## Decisions (confirmed)

- **Channels:** in-app and Slack now. Email later, once it is set up. Notification actions go through one `notify` interface so an `email` channel plugs in without changing automations.
- **Who creates automations:** group leaders and creators (and SuperAdmin).
- **Removed members:** the access rule stays. Someone removed from a group stops seeing that group's tickets. Their assignment record is kept: removal does not clear `assigneeIds`, and the activity log keeps the history. The overview below must still count those tickets.

## Phase 1b — Per-user work overview ("did they do it?")

A page that shows, for each person, what was assigned to them and what happened to it.

**Per user**
- Assigned total, completed (Completed or Closed), in progress, open and not started, blocked, overdue.
- Completion rate and on-time rate (completed on or before due date).
- Average time from assignment to completion.
- List of their tickets with status, due date and group. Filter by group, status and date range.
- Includes tickets in groups they have since left, marked "left group".

**Who sees what**
- A person sees their own overview.
- Leaders and creators see the overview for members of their groups, limited to tickets in those groups.
- SuperAdmin sees everyone.

**Backend**
- `GET /reports/people` (summary rows) and `GET /reports/people/:userId` (detail), scoped by the viewer's groups as above. They query by assignee directly and do not use the member-only visibility filter, so ex-member assignments are counted.
- Completion time needs the moment of assignment. Check that `recordActivity` stores assignment changes with a timestamp. If not, add an `assignedAt` entry per assignee on tickets going forward, and fall back to ticket creation time for older tickets.
- Index on `assigneeIds` and `status` already exist. Add `completedAt` to the query for time-based stats.

**Frontend**
- New "People" tab on Reports, plus a link from each member row on the group page.
- Table with sortable columns and a small progress bar per person. Row click opens the detail view.

**Tests:** leader of group A cannot see tickets from group B for the same person, ex-member tickets are counted, a member cannot view someone else's overview.

## Open questions

- Should the overview be visible to the person themselves only for their own, or may members of a group see each other's? Assumed: own only, plus leaders and creators for their groups.
- Do we want a weekly summary posted to Slack or in-app for leaders (per-person done and overdue)? It would be a small add-on to the automations engine.
