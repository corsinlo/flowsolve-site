export const EVENT_TIMING_REPORTING_FLOOR_MS = 16;

export interface InteractionClassificationInput {
  label: string;
  beforeInteractionCount: number;
  afterInteractionCount: number;
  beforeIds: ReadonlySet<number>;
  durations: ReadonlyMap<number, number>;
}

export interface InteractionMeasurement {
  label: string;
  durationLabel: string;
  upperBoundMs: number;
  interactionIds: number[];
}

export interface InteractionSnapshot {
  interactionCount: number;
  ids: ReadonlySet<number>;
}

export interface InteractionState {
  interactionCount: number;
  durations: ReadonlyMap<number, number>;
}

export interface SettledInteractionDependencies {
  label: string;
  before: InteractionSnapshot;
  waitForInteractionCountIncrease: (beforeInteractionCount: number) => Promise<void>;
  settleRenderingAndObserver: () => Promise<void>;
  readInteractionState: () => Promise<InteractionState>;
}

export interface SettledInteractionResult {
  measurement: InteractionMeasurement;
  state: InteractionState;
}

export function nearestRankP75(samples: readonly number[]): number {
  if (samples.length === 0) throw new Error('At least one page-view sample is required');
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.75) - 1]!;
}

export function classifyInteraction({
  label,
  beforeInteractionCount,
  afterInteractionCount,
  beforeIds,
  durations,
}: InteractionClassificationInput): InteractionMeasurement {
  if (afterInteractionCount <= beforeInteractionCount) {
    throw new Error(`${label} did not increase performance.interactionCount`);
  }

  const interactionIds = [...durations.keys()].filter((id) => !beforeIds.has(id));
  if (interactionIds.length === 0) {
    return {
      label,
      durationLabel: `<${EVENT_TIMING_REPORTING_FLOOR_MS}ms`,
      upperBoundMs: EVENT_TIMING_REPORTING_FLOOR_MS,
      interactionIds,
    };
  }

  const upperBoundMs = Math.max(...interactionIds.map((id) => durations.get(id) ?? 0));
  return {
    label,
    durationLabel: `${upperBoundMs.toFixed(0)}ms`,
    upperBoundMs,
    interactionIds,
  };
}

export async function measureSettledInteraction({
  label,
  before,
  waitForInteractionCountIncrease,
  settleRenderingAndObserver,
  readInteractionState,
}: SettledInteractionDependencies): Promise<SettledInteractionResult> {
  await waitForInteractionCountIncrease(before.interactionCount);
  await settleRenderingAndObserver();
  const state = await readInteractionState();
  return {
    measurement: classifyInteraction({
      label,
      beforeInteractionCount: before.interactionCount,
      afterInteractionCount: state.interactionCount,
      beforeIds: before.ids,
      durations: state.durations,
    }),
    state,
  };
}
