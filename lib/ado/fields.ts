// Canonical Carrito fields we map ADO CSV columns onto.
export type CarritoField =
  | 'work_item_id'
  | 'work_item_type'
  | 'title'
  | 'assigned_to'
  | 'developer'
  | 'state'
  | 'story_points'
  | 'iteration_path'
  | 'area_path'
  | 'tags'
  | 'priority'
  | 'parent_id'
  | 'created_date'
  | 'closed_date'
  | 'changed_date'
  | 'carry_over_points';

export interface FieldDef {
  field: CarritoField;
  label: string;
  required: boolean;
  synonyms: string[];
  /** Shown in the import wizard so people know why a column matters. */
  hint?: string;
}

export const FIELD_DEFS: FieldDef[] = [
  { field: 'work_item_id', label: 'Work Item ID', required: true, synonyms: ['id', 'workitemid', 'work item id', 'ado id'] },
  { field: 'work_item_type', label: 'Type', required: false, synonyms: ['work item type', 'type', 'workitemtype'] },
  { field: 'title', label: 'Title', required: true, synonyms: ['title', 'title 1', 'title1', 'name', 'summary'] },
  {
    field: 'created_date',
    label: 'Created Date',
    required: false,
    synonyms: ['created date', 'createddate', 'created'],
    hint: 'Required for scope-creep metrics: work created after the sprint started counts as Unplanned, not Commitment.',
  },
  {
    field: 'developer',
    label: 'Developer',
    required: false,
    synonyms: ['developer', 'developer/admin', 'assigned developer'],
    hint: 'Who does the work. Falls back to Assigned To when absent — per-member capacity is keyed on this.',
  },
  { field: 'assigned_to', label: 'Assigned To', required: false, synonyms: ['assigned to', 'assignedto', 'assignee', 'owner'] },
  { field: 'state', label: 'State', required: false, synonyms: ['state', 'status'] },
  { field: 'story_points', label: 'Story Points', required: false, synonyms: ['story points', 'storypoints', 'points', 'effort', 'size', 'story points (estimated)'] },
  {
    field: 'carry_over_points',
    label: 'Carry-over Points',
    required: false,
    synonyms: ['carry over', 'carryover', 'carry-over', 'carry over points', 'spilled points'],
    hint: 'Points that spill into the next sprint. Left blank, Carrito derives it when you close the sprint.',
  },
  { field: 'iteration_path', label: 'Iteration', required: false, synonyms: ['iteration path', 'iterationpath', 'sprint', 'iteration'] },
  { field: 'area_path', label: 'Area Path', required: false, synonyms: ['area path', 'areapath', 'area'] },
  { field: 'tags', label: 'Tags', required: false, synonyms: ['tags', 'labels'] },
  { field: 'priority', label: 'Priority', required: false, synonyms: ['priority', 'prio'] },
  { field: 'parent_id', label: 'Parent', required: false, synonyms: ['parent', 'parent id'] },
  { field: 'closed_date', label: 'Closed Date', required: false, synonyms: ['closed date', 'closeddate', 'resolved date'] },
  { field: 'changed_date', label: 'Changed Date', required: false, synonyms: ['changed date', 'state change date', 'changeddate'] },
];

export type ColumnMapping = Partial<Record<CarritoField, string | null>>;

/**
 * States that satisfy the Definition of Done.
 *
 * 'Removed' is deliberately NOT here: removed work is cancelled, not delivered,
 * and counting it as done inflates velocity. See REMOVED_STATES.
 * Keep in sync with public.is_done_state() in 0003_scrum_metrics.sql.
 */
export const DONE_STATES = new Set(['done', 'closed', 'resolved', 'completed', 'accepted']);

/** Work that was cancelled. Neither committed nor delivered. */
export const REMOVED_STATES = new Set(['removed', 'cut', 'cancelled', 'canceled']);

export const isDoneState = (state?: string | null) =>
  DONE_STATES.has((state ?? '').trim().toLowerCase());

export const isRemovedState = (state?: string | null) =>
  REMOVED_STATES.has((state ?? '').trim().toLowerCase());
