import { DONE_STATES } from '@/lib/ado/fields';
import type { Sprint, UserStory } from '@/lib/types/domain';

export interface SprintAggregate {
  sprintId: string;
  name: string;
  startDate: string;
  committedPoints: number; // non-carry-over
  carryOverPoints: number;
  completedPoints: number; // stories in a done state
  totalPoints: number;
  storyCount: number;
  carryOverCount: number;
}

const pts = (s: UserStory) => s.story_points ?? 0;
const isDone = (s: UserStory) => DONE_STATES.has((s.state_raw ?? '').toLowerCase());

export function aggregateBySprint(sprints: Sprint[], stories: UserStory[]): SprintAggregate[] {
  const byId = new Map<string, UserStory[]>();
  for (const s of stories) {
    if (!s.sprint_id) continue;
    const arr = byId.get(s.sprint_id) ?? [];
    arr.push(s);
    byId.set(s.sprint_id, arr);
  }
  return sprints
    .map((sp) => {
      const list = byId.get(sp.id) ?? [];
      return {
        sprintId: sp.id,
        name: sp.name,
        startDate: sp.start_date,
        committedPoints: round(list.filter((s) => !s.is_carry_over).reduce((a, s) => a + pts(s), 0)),
        carryOverPoints: round(list.filter((s) => s.is_carry_over).reduce((a, s) => a + pts(s), 0)),
        completedPoints: round(list.filter(isDone).reduce((a, s) => a + pts(s), 0)),
        totalPoints: round(list.reduce((a, s) => a + pts(s), 0)),
        storyCount: list.length,
        carryOverCount: list.filter((s) => s.is_carry_over).length,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function round(x: number) {
  return Math.round(x * 10) / 10;
}

/** Pick the sprint to feature: one containing today, else next upcoming, else most recent. */
export function pickCurrentSprint(sprints: Sprint[], today: string): Sprint | null {
  if (!sprints.length) return null;
  const containing = sprints.find((s) => s.start_date <= today && s.end_date >= today);
  if (containing) return containing;
  const upcoming = sprints
    .filter((s) => s.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return upcoming;
  return [...sprints].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}
