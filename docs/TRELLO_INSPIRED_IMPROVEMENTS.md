# Trello-Inspired Improvements

This document captures what features are worth borrowing from Trello, how the portal differs (and where it wins), and a concrete plan for making the work item board UI compact and fast to use.

---

## Why Trello's UI Feels Fast

Trello's core interaction model is:
- **Small cards on a board** — you see 10–20 items at a glance without scrolling
- **Click to expand** — details open in a slide-out drawer or modal, not a new page
- **Drag to change status** — no dropdowns or save buttons for simple status moves
- **Inline quick-add** — type a title and press Enter, the card appears immediately
- **Color labels** — one glance tells you the type/urgency without reading text

The portal's current board (ProjectDetailPage) does none of these. Each work item shows everything at once, which makes the board dense and slow to scan.

---

## Feature Backlog (Prioritized)

### Tier 1 — High value, focused scope

| # | Feature | Where | Why it matters |
|---|---|---|---|
| 1 | **Compact card view on the board** | ProjectDetailPage | Current cards are tall; board feels like a list, not a kanban |
| 2 | **Click-to-open card drawer** | ProjectDetailPage | Edit/view details without leaving the board |
| 3 | **Drag-and-drop status columns** | ProjectDetailPage | Fastest way to move items; no dropdown + save required |
| 4 | **Inline quick-add card** | ProjectDetailPage | Type title → Enter → card appears at top of column |
| 5 | **Color labels on cards** | Work items | Instant visual scanning by type or priority |

### Tier 2 — Medium value

| # | Feature | Where | Why it matters |
|---|---|---|---|
| 6 | **Checklist inside a work item** | Work item detail | Break big tasks into steps; shows completion % on card |
| 7 | **Markdown in descriptions** | Work item detail | Bullets, bold, code blocks for technical tasks |
| 8 | **"Watch" a card** | Work item detail | Get notified on status change without being an assignee |
| 9 | **Work item search / filter bar** | ProjectDetailPage | Find items fast on large boards |
| 10 | **Activity log on a card** | Work item detail | Who changed status + when; audit trail at item level |

### Tier 3 — Nice to have later

| # | Feature | Where | Why it matters |
|---|---|---|---|
| 11 | **"Blocked by" card linking** | Work item detail | Visualize dependency chains; shows why status = blocked |
| 12 | **Due date calendar view** | Projects section | See all deadlines across a project in calendar form |
| 13 | **Card templates** | ProjectDetailPage | Reuse common task structures (e.g., "Bug report") |
| 14 | **Move card between projects** | Work item detail | Rescope a task without recreating it |

### What we are NOT adding (Trello has it; we don't need it)

- Card voting — not relevant for volunteer task tracking
- Card aging (greyscale on stale cards) — we have status = blocked for stale work
- Guest access — join requests + invite system already cover this
- Butler automation — overkill for current team size

---

## Compact Board UI Plan

### Current state (problem)

The ProjectDetailPage work item board currently renders each item as a tall row/card with:
- Title visible
- Description truncated
- Status badge
- Priority badge
- Assignee names spelled out
- Due date spelled out
- Edit/delete buttons always visible

This wastes vertical space and makes a 10-item board feel overwhelming.

### Target state (Trello-style)

Each card should show **only what you need to scan**:

```
┌─────────────────────────────────────┐
│ 🔴 Design onboarding flow           │   ← title, color label dot
│ ⏰ Apr 30  👤 Ujwal                  │   ← due date + assignee avatar
└─────────────────────────────────────┘
```

- Card height: ~60–70px (current: ~120px+)
- Full details only visible after clicking (drawer slides in from right)
- Hover shows edit/delete icon buttons, not always-on

### Column layout

Four columns side by side, each scrollable independently:

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  PENDING  3  │  ACTIVE   4  │  BLOCKED  1  │  DONE     7  │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Card         │ Card         │ Card         │ Card         │
│ Card         │ Card         │              │ Card         │
│ + Add card   │ + Add card   │ + Add card   │ Card         │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Each column header shows item count. Columns are fixed width (240–280px), board scrolls horizontally if needed.

### Card drawer (replacing current edit modal)

When a card is clicked, a drawer slides in from the right (400px wide). It contains:
- Title (editable inline)
- Status, Priority, Type dropdowns (inline selects)
- Assignee(s) with avatars
- Due date picker
- Description (markdown editor, or plain textarea for now)
- Checklist (Tier 2)
- Activity log (Tier 2)
- Delete button at bottom

Drawer closes on Escape or clicking outside. No page navigation.

### Drag and drop

Use the browser's native HTML5 drag-and-drop API (no library needed for basic implementation):
- Drag a card from one column → drop into another column
- On drop, send PATCH `/projects/{id}/work-items/{itemId}` with new status
- Optimistic UI update (move card immediately, revert if API fails)

For a more polished feel later, `@dnd-kit/core` (1.5kb gzipped) is the standard React drag-and-drop library and works well with accessibility requirements.

### Inline quick-add

At the bottom of each column, a "+ Add card" button:
- Click → transforms into a text input in the column
- Type title → press Enter → POST to create item with that column's status
- Escape cancels without creating
- Card appears at top of column immediately (optimistic)

---

## Color Labels

Work items have a `priority` field (low/medium/high/urgent) and an `item_type` field. Both can drive color labels.

### Priority → left border color on card

```
low     → grey left border
medium  → blue left border
high    → orange left border
urgent  → red left border
```

This is Trello's most copied pattern — one colored stripe on the left of the card signals urgency without a badge or text.

### Type → small color dot next to title

```
task     → no dot (default)
bug      → red dot
feature  → green dot
design   → purple dot
research → yellow dot
```

---

## Implementation Approach

### Phase 1 — Compact cards + column layout (2–3 days)

Goal: board looks like Trello, no behavior change yet.

1. Refactor `ProjectDetailPage` columns from a vertical list into a 4-column horizontal grid
2. Redesign each card to compact height
3. Add priority left-border color and type dot
4. Move edit/delete to hover-only
5. Keep existing edit modal (don't build drawer yet)

Files to change:
- [frontend-react/src/pages/ProjectDetailPage.tsx](../frontend-react/src/pages/ProjectDetailPage.tsx) — main board layout and card component
- [frontend-react/src/index.css](../frontend-react/src/index.css) — add `.work-item-card`, `.board-column`, `.board-column-header` classes

### Phase 2 — Card drawer (1–2 days)

Goal: clicking a card opens a right-side drawer instead of navigating away or opening a center modal.

1. Build `WorkItemDrawer` component
2. Route card clicks to open drawer with item data
3. Inline edit fields inside drawer (title, status, priority, assignee, due date, description)
4. Wire to existing PATCH API

New file: `frontend-react/src/components/WorkItemDrawer.tsx`

### Phase 3 — Inline quick-add (1 day)

Goal: "+ Add card" at the bottom of each column.

1. Add `QuickAddCard` component per column
2. On submit, POST work item with the column's status pre-filled
3. Optimistic insert at top of column

### Phase 4 — Drag and drop (2 days)

Goal: drag a card between columns to change its status.

1. Add `@dnd-kit/core` dependency
2. Wrap board in `DndContext`
3. Make each column a `Droppable`
4. Make each card a `Draggable`
5. On drop, PATCH item status + optimistic update

### Phase 5 — Checklists (2–3 days)

Goal: work items can have a list of sub-tasks.

Backend changes needed:
- Add `checklist: list[ChecklistItem]` field to `ProjectWorkItem` model
  - `ChecklistItem`: `{ id, text, checked, created_at }`
- PATCH endpoint already accepts arbitrary updates; just add field to schema

Frontend changes:
- Checklist section in `WorkItemDrawer`
- Checkbox toggle calls PATCH inline
- Card shows completion fraction (e.g., "3/5") when checklist exists

---

## What the Board Will Look Like After Phase 1–2

```
Pending (3)          Active (4)           Blocked (1)          Done (7)
──────────────────   ──────────────────   ──────────────────   ──────────────────
┌────────────────┐   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ Design landing │   │ Fix login bug  │   │ Write docs  🔴 │   ┌ Archive API    ┐
│ ⏰ May 2  👤 A  │   │ No due  👤 U   │   │ ⏰ May 1  👤 U  │   │ Done  👤 A     │
└────────────────┘   └────────────────┘   └────────────────┘   └────────────────┘
┌────────────────┐   ┌────────────────┐                        ┌────────────────┐
│ Write tests    │   │ Review PR #12  │                        │ Setup CI/CD    │
│ No due  👤 U   │   │ ⏰ Apr 30 👤 A  │                        │ Done  👤 U     │
└────────────────┘   └────────────────┘                        └────────────────┘
+ Add card           + Add card           + Add card           + Add card
```

Compact, scannable, all four statuses visible at once.

---

## Key Differences We Keep (Don't Copy These from Trello)

These are things Trello does NOT have that make this portal valuable — do not compromise them:

- **Weekly submission review workflow** — the whole point of the portal
- **Hour tracking (reported vs. credited)** — accountability for volunteer hours
- **Join request / access control** — controlled project membership
- **Role hierarchy** — admin/team_lead/volunteer with delegated scopes
- **Admin review + notes on submissions** — Trello has no equivalent

The work item board is a supporting feature. The submission system is the core.
