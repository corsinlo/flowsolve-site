import type { LandingCopy } from './types';

export const EN_COPY: LandingCopy = {
  meta: { title: 'Flowsolve | Evidence-backed quote drafts', description: 'Turn fragmented automotive parts requests into evidence-backed candidates and a human-reviewed quote draft.', ogTitle: 'Flowsolve automotive pilot', ogDescription: 'From messy request to evidence-backed quote draft.' },
  accessibility: { skipToContent: 'Skip to content', languageNavigation: 'Choose language', pageNavigation: 'Page navigation', externalDestination: 'Opens an external destination' },
  sectionLabels: { problem: 'The gap', how: 'The operating loop', automotive: 'Industry pack / 01', futurePacks: 'Next hypotheses', trust: 'Decision boundary', pilot: 'Invitation only' },
  nav: { story: 'Resolution story', howItWorks: 'How it works', automotive: 'Automotive pilot', trust: 'Trust' },
  hero: { eyebrow: 'Automotive pilot · human reviewed', title: 'From messy request to evidence-backed quote draft.', body: 'Flowsolve keeps fragmented messages, images, audio and identifiers together, exposes what is missing, and prepares candidates for an employee to review.' },
  story: {
    heading: 'See the request resolve', lead: 'Each stage preserves its source and keeps uncertainty visible.', stageLabel: 'Resolution stage',
    stages: {
      conversation: { eyebrow: '01 · Receive', title: 'One request, five fragments', body: 'Messages, images, audio, a plate and a part description remain attached to one case.', statusLabel: 'Source preserved', evidenceItems: ['Original wording', 'Attachment references', 'Detected language'] },
      extraction: { eyebrow: '02 · Understand', title: 'Explicit facts become structured', body: 'The pilot extracts identifiers, requested component and quantity without inventing absent values.', statusLabel: 'Structured suggestion', evidenceItems: ['Plate or supplied VIN', 'Requested component', 'Quantity'] },
      'missing-data': { eyebrow: '03 · Clarify', title: 'Missing data stays missing', body: 'Conflicts and absent vehicle details are shown as questions instead of hidden behind a confident answer.', statusLabel: 'Review needed', evidenceItems: ['Unknown variant', 'Conflicting identifier', 'Suggested question'] },
      candidates: { eyebrow: '04 · Resolve', title: 'Candidates carry evidence', body: 'Authorised catalogue facts and permitted vehicle data support a shortlist; vehicle identity alone never proves fitment.', statusLabel: 'Evidence attached', evidenceItems: ['Catalogue source', 'Match reason', 'Known limitation'] },
      approval: { eyebrow: '05 · Decide', title: 'A person controls the outcome', body: 'An operator approves, corrects or rejects the suggestion. Low-confidence and safety-critical cases cannot bypass review.', statusLabel: 'Human decision required', evidenceItems: ['Confidence in words and numbers', 'Operator action', 'Audit reference'] },
      quotation: { eyebrow: '06 · Prepare', title: 'The decision becomes a quote draft', body: 'Approved facts produce localised, editable customer copy. The pilot does not send messages or place orders.', statusLabel: 'Draft—not sent', evidenceItems: ['Approved product', 'Offer source', 'Versioned draft'] },
    },
  },
  problem: { heading: 'The costly work happens between the message and the quote', body: 'Parts-desk teams copy identifiers, chase missing details and compare catalogues before they can answer a customer.', costs: ['Repeated data entry', 'Slow clarification loops', 'Wrong-part returns and rebilling'] },
  howItWorks: { heading: 'Receive. Understand. Resolve. Approve.', steps: [
    { id: 'receive', title: 'Keep the request together', body: 'Preserve the conversation and its attachments as one case.' },
    { id: 'understand', title: 'Extract only what is present', body: 'Structure identifiers, intent and quantity; label unknowns clearly.' },
    { id: 'resolve', title: 'Retrieve with evidence', body: 'Use authorised catalogue data and attributed vehicle enrichment.' },
    { id: 'approve', title: 'Let the operator decide', body: 'Approve, correct or reject before a quote draft exists.' },
  ] },
  packs: { heading: 'A reusable resolution core, starting with one focused pack', automotive: { status: 'Automotive pilot', title: 'Automotive spare-parts desks', body: 'Historical replay for Dutch and Italian requests, with RDW/vPIC enrichment where eligible and authorised catalogue evidence for candidate parts.' }, futureHeading: 'Possible next packs', underEvaluation: 'Under evaluation', future: [
    { id: 'hvac', title: 'Boiler and HVAC parts', body: 'Requires separate workflow, catalogue-access and buyer validation.' },
    { id: 'plumbing', title: 'Plumbing parts', body: 'Requires separate workflow, catalogue-access and buyer validation.' },
    { id: 'electrical', title: 'Electrical parts', body: 'Requires separate workflow, catalogue-access and buyer validation.' },
  ] },
  trust: { heading: 'Evidence first. Human controlled.', body: 'Flowsolve is a review layer, not a replacement catalogue and not an autonomous sales agent.', principles: ['Original source is preserved', 'Externally retrieved facts show source and limitations', 'Unknown values remain unknown', 'No quote is sent and no order is placed in replay mode'] },
  pilot: { heading: 'Evaluate it on your own historical requests', body: 'The first pilot is invitation-only and designed for technical distributors with lawful, anonymised cases and an authorised evidence catalogue.', requestLabel: 'Request a pilot', signInLabel: 'Pilot sign in', previewRequestLabel: 'Pilot requests coming soon', previewSignInLabel: 'Pilot sign-in coming soon' },
  quoteExample: { illustrativeLabel: 'Illustrative quote draft', evidenceLabel: 'Evidence attached', reviewRequiredLabel: 'Human approval required', taxLabel: 'VAT included', amountMinor: 129900 },
  footer: { summary: 'Flowsolve prepares evidence-backed quote drafts for human review.', previewNotice: 'Temporary product preview. No transactions are processed on this site.' },
};
