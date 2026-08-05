export const LOCALES = ['en', 'it', 'nl'] as const;
export const STORY_STAGE_IDS = ['conversation', 'extraction', 'missing-data', 'candidates', 'approval', 'quotation'] as const;

export type Locale = (typeof LOCALES)[number];
export type StoryStageId = (typeof STORY_STAGE_IDS)[number];

export interface StoryStageCopy {
  eyebrow: string;
  title: string;
  body: string;
  statusLabel: string;
  evidenceItems: readonly string[];
}

export interface LandingCopy {
  meta: { title: string; description: string; ogTitle: string; ogDescription: string };
  accessibility: { skipToContent: string; languageNavigation: string; pageNavigation: string; externalDestination: string };
  sectionLabels: { problem: string; how: string; automotive: string; futurePacks: string; trust: string; pilot: string };
  nav: { story: string; howItWorks: string; automotive: string; trust: string };
  hero: { eyebrow: string; title: string; body: string };
  story: { heading: string; lead: string; stageLabel: string; stages: Record<StoryStageId, StoryStageCopy> };
  problem: { heading: string; body: string; costs: readonly string[] };
  howItWorks: { heading: string; steps: readonly { id: 'receive' | 'understand' | 'resolve' | 'approve'; title: string; body: string }[] };
  packs: { heading: string; automotive: { status: string; title: string; body: string }; futureHeading: string; underEvaluation: string; future: readonly { id: 'hvac' | 'plumbing' | 'electrical'; title: string; body: string }[] };
  trust: { heading: string; body: string; principles: readonly string[] };
  pilot: { heading: string; body: string; requestLabel: string; signInLabel: string; previewRequestLabel: string; previewSignInLabel: string };
  quoteExample: { illustrativeLabel: string; evidenceLabel: string; reviewRequiredLabel: string; taxLabel: string; amountMinor: number };
  footer: { summary: string; previewNotice: string };
}

export type DeepPartial<T> = T extends readonly (infer Item)[] ? readonly DeepPartial<Item>[] : T extends object ? { [Key in keyof T]?: DeepPartial<T[Key]> } : T;
export type PublicLinks =
  | { mode: 'preview' }
  | { mode: 'live'; requestPilot: URL; pilotSignIn: URL };
