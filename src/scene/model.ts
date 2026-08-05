import type { StoryStageId } from '../i18n/types';

export type SceneMode = 'poster' | 'low' | 'full';

export interface SceneSnapshot {
  stage: StoryStageId;
  localProgress: number;
  signalConvergence: number;
  coreActivation: number;
  missingDataEmphasis: number;
  candidateReveal: number;
  reviewGateOpen: number;
  quoteReveal: number;
  accent: 'ivory' | 'amber' | 'lime';
}
