import { STORY_STAGE_IDS } from '../i18n/types';
import type { SceneSnapshot } from './model';

const STAGE_LENGTH = 1 / STORY_STAGE_IDS.length;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function ramp(progress: number, start: number, end: number): number {
  return Number(clamp((progress - start) / (end - start)).toFixed(6));
}

export function deriveSceneSnapshot(progress: number): SceneSnapshot {
  const normalized = clamp(progress);
  const stageIndex = Math.min(STORY_STAGE_IDS.length - 1, Math.floor(normalized / STAGE_LENGTH));
  const stage = STORY_STAGE_IDS[stageIndex];
  const localProgress = clamp((normalized * STORY_STAGE_IDS.length) - stageIndex);

  return {
    stage,
    localProgress,
    signalConvergence: ramp(normalized, STAGE_LENGTH, 2 * STAGE_LENGTH),
    coreActivation: ramp(normalized, STAGE_LENGTH, 2 * STAGE_LENGTH),
    missingDataEmphasis: ramp(normalized, 2 * STAGE_LENGTH, 3 * STAGE_LENGTH),
    candidateReveal: ramp(normalized, 3 * STAGE_LENGTH, 4 * STAGE_LENGTH),
    reviewGateOpen: ramp(normalized, 4 * STAGE_LENGTH, 5 * STAGE_LENGTH),
    quoteReveal: ramp(normalized, 5 * STAGE_LENGTH, 1),
    accent: stage === 'missing-data' ? 'amber' : stage === 'approval' || stage === 'quotation' ? 'lime' : 'ivory',
  };
}
