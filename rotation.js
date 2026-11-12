/** Pure, testable rotation logic. No network or browser dependencies. */
export const MEMBERS = Object.freeze({ ABC: Object.freeze(['A','C','B']), AB: Object.freeze(['A','B']) });
export const MODES = Object.freeze(['ABC','AB']);
// Keep stable A/B/C identifiers in saved history and rotation state.
export const MEMBER_NAMES = Object.freeze({ A: '토니', B: '코비', C: '영' });
export function displayName(memberId) { return MEMBER_NAMES[memberId] ?? memberId; }

export function initialState() {
  return { next: { ABC: 0, AB: 0 }, counts: { ABC: 0, AB: 0 }, lastEventId: null };
}
export function normalizedState(state) {
  const defaults = initialState();
  const input = state && typeof state === 'object' ? state : {};
  return {
    next: { ...defaults.next, ...(input.next ?? {}) },
    counts: { ...defaults.counts, ...(input.counts ?? {}) },
    lastEventId: input.lastEventId ?? null
  };
}
export function buyerFor(state, mode) {
  if (!Object.hasOwn(MEMBERS, mode)) throw new Error('알 수 없는 순번 모드입니다.');
  const index = normalizedState(state).next[mode];
  return MEMBERS[mode][((index % MEMBERS[mode].length) + MEMBERS[mode].length) % MEMBERS[mode].length];
}
export function purchaseTransition(state, mode, id, actor, createdAt) {
  if (!Object.hasOwn(MEMBERS, mode)) throw new Error('알 수 없는 순번 모드입니다.');
  const previous = normalizedState(state);
  const before = previous.next[mode];
  const buyer = buyerFor(previous, mode);
  const next = {
    next: { ...previous.next, [mode]: (before + 1) % MEMBERS[mode].length },
    counts: { ...previous.counts, [mode]: previous.counts[mode] + 1 },
    lastEventId: id
  };
  const event = { id, mode, buyer, before, previousLastEventId: previous.lastEventId, actor, createdAt };
  return { next, event };
}
export function undoTransition(state, event) {
  const current = normalizedState(state);
  if (!event || current.lastEventId !== event.id || !Object.hasOwn(MEMBERS, event.mode)) {
    throw new Error('최근 기록이 변경되었습니다. 화면을 새로고침하고 다시 시도하세요.');
  }
  return {
    next: { ...current.next, [event.mode]: event.before },
    counts: { ...current.counts, [event.mode]: Math.max(0, current.counts[event.mode] - 1) },
    lastEventId: event.previousLastEventId ?? null
  };
}