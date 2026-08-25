// Canonical Carrito fields we map ADO CSV columns onto.
export type CarritoField =
  | 'work_item_id'
  | 'work_item_type'
  | 'title'
  | 'assigned_to'
  | 'state'
  | 'story_points'
  | 'iteration_path'
  | 'area_path'
  | 'tags'
  | 'priority'
  | 'parent_id'
  | 'changed_date';

export interface FieldDef {
  field: CarritoField;
  label: string;
  required: boolean;
  synonyms: string[];
}

export const FIELD_DEFS: FieldDef[] = [
  { field: 'work_item_id', label: 'Work Item ID', required: true, synonyms: ['id', 'workitemid', 'work item id', 'ado id'] },
  { field: 'work_item_type', label: 'Type', required: false, synonyms: ['work item type', 'type', 'workitemtype'] },
  { field: 'title', label: 'Title', required: true, synonyms: ['title', 'title 1', 'title1', 'name', 'summary'] },
  { field: 'assigned_to', label: 'Assigned To', required: false, synonyms: ['assigned to', 'assignedto', 'assignee', 'owner'] },
  { field: 'state', label: 'State', required: false, synonyms: ['state', 'status'] },
  { field: 'story_points', label: 'Story Points', required: false, synonyms: ['story points', 'storypoints', 'points', 'effort', 'size'] },
  { field: 'iteration_path', label: 'Iteration', required: false, synonyms: ['iteration path', 'iterationpath', 'sprint', 'iteration'] },
  { field: 'area_path', label: 'Area Path', required: false, synonyms: ['area path', 'areapath', 'area'] },
  { field: 'tags', label: 'Tags', required: false, synonyms: ['tags', 'labels'] },
  { field: 'priority', label: 'Priority', required: false, synonyms: ['priority', 'prio'] },
  { field: 'parent_id', label: 'Parent', required: false, synonyms: ['parent', 'parent id'] },
  { field: 'changed_date', label: 'Changed Date', required: false, synonyms: ['changed date', 'state change date', 'changeddate'] },
];

export type ColumnMapping = Partial<Record<CarritoField, string | null>>;

export const DONE_STATES = new Set(['done', 'closed', 'resolved', 'removed']);
