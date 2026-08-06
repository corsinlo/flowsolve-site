import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const stageIds = ['conversation', 'extraction', 'missing-data', 'candidates', 'approval', 'quotation'];
const sectionIds = ['story', 'problem', 'how', 'automotive', 'future-packs', 'trust', 'pilot'];
const preservedSections = sectionIds;

const localeExpectations = {
  en: {
    pageNavigation: 'Page navigation',
    underEvaluation: 'Under evaluation',
    humanReview: 'Human approval required',
    noGuaranteedFit: 'vehicle identity alone never proves fitment',
    previewRequest: 'Pilot requests coming soon',
    previewSignIn: 'Pilot sign-in coming soon',
    previewNotice: 'Temporary product preview. No transactions are processed on this site.',
    sectionLabels: ['The gap', 'The operating loop', 'Industry pack / 01', 'Next hypotheses', 'Decision boundary', 'Invitation only'],
    trustStatements: ['Flowsolve is a review layer, not a replacement catalogue and not an autonomous sales agent.', 'Original source is preserved', 'Externally retrieved facts show source and limitations', 'No quote is sent and no order is placed in replay mode'],
  },
  it: {
    pageNavigation: 'Navigazione della pagina',
    underEvaluation: 'In fase di valutazione',
    humanReview: 'Approvazione umana richiesta',
    noGuaranteedFit: 'l’identità del veicolo da sola non prova la compatibilità',
    previewRequest: 'Richieste pilota: prossimamente',
    previewSignIn: 'Accesso al pilota: prossimamente',
    previewNotice: 'Anteprima temporanea del prodotto. Questo sito non elabora transazioni.',
    sectionLabels: ['Il problema', 'Il ciclo operativo', 'Pack di settore / 01', 'Ipotesi successive', 'Confine decisionale', 'Solo su invito'],
    trustStatements: ['Flowsolve è un livello di verifica, non un catalogo sostitutivo né un agente di vendita autonomo.', 'La fonte originale viene conservata', 'I fatti esterni mostrano fonte e limiti', 'In modalità replay non vengono inviati preventivi né effettuati ordini'],
  },
  nl: {
    pageNavigation: 'Paginanavigatie',
    underEvaluation: 'In onderzoek',
    humanReview: 'Menselijke goedkeuring vereist',
    noGuaranteedFit: 'voertuigidentiteit alleen bewijst nooit dat een onderdeel past',
    previewRequest: 'Pilot aanvragen: binnenkort',
    previewSignIn: 'Pilot-inlog: binnenkort',
    previewNotice: 'Tijdelijke productpreview. Deze site verwerkt geen transacties.',
    sectionLabels: ['Het probleem', 'De werkwijze', 'Branchepakket / 01', 'Volgende hypotheses', 'Beslissingsgrens', 'Alleen op uitnodiging'],
    trustStatements: ['Flowsolve is een beoordelingslaag, geen vervangende catalogus en geen autonome verkoopagent.', 'De oorspronkelijke bron blijft bewaard', 'Externe feiten tonen bron en beperkingen', 'In replaymodus wordt niets verstuurd en geen bestelling geplaatst'],
  },
} as const;

function localeHtml(locale: keyof typeof localeExpectations) {
  return load(readFileSync(join(projectRoot, 'dist', locale, 'index.html'), 'utf8'));
}

describe.each(Object.entries(localeExpectations))('%s generated landing page', (locale, expected) => {
  const typedLocale = locale as keyof typeof localeExpectations;

  it('renders one page heading', () => {
    const $ = localeHtml(typedLocale);

    expect($('main h1')).toHaveLength(1);
  });

  it.each(sectionIds)('renders the #%s section once', (sectionId) => {
    expect(localeHtml(typedLocale)(`main section#${sectionId}`)).toHaveLength(1);
  });

  it('renders the six resolution stages as ordered semantic articles', () => {
    const $ = localeHtml(typedLocale);

    expect($('#story article[data-story-stage]').map((_, article) => $(article).attr('data-story-stage')).get()).toEqual(stageIds);
  });

  it('renders the four operating steps in order', () => {
    const $ = localeHtml(typedLocale);

    expect($('#how ol > li').map((_, step) => $(step).attr('data-step')).get()).toEqual(['receive', 'understand', 'resolve', 'approve']);
  });

  it('localizes every visible section label', () => {
    const $ = localeHtml(typedLocale);
    const selectors = ['#problem', '#how', '#automotive', '#future-packs', '#trust', '#pilot'];

    expect(selectors.map((selector) => $(`${selector} .section-kicker`).first().text().trim())).toEqual(expected.sectionLabels);
  });

  it('renders localized navigation and resilient locale destinations without JavaScript', () => {
    const $ = localeHtml(typedLocale);

    expect($('header nav[data-locale-navigation]')).toHaveLength(1);
    expect($(`header nav[aria-label="${expected.pageNavigation}"]`)).toHaveLength(1);
    expect($('header script')).toHaveLength(0);

    for (const section of preservedSections) {
      const destinations = $(`[data-preserves-section="${section}"] a[hreflang]`)
        .map((_, anchor) => $(anchor).attr('href'))
        .get();
      expect(destinations).toEqual([
        `/flowsolve-site/en/#${section}`,
        `/flowsolve-site/it/#${section}`,
        `/flowsolve-site/nl/#${section}`,
      ]);
    }
  });

  it('marks the automotive pilot and every future pack status explicitly', () => {
    const $ = localeHtml(typedLocale);
    const futurePacks = $('#future-packs article[data-status="under-evaluation"]');

    expect(futurePacks).toHaveLength(3);
    futurePacks.each((_, pack) => expect($(pack).text()).toContain(expected.underEvaluation));
    expect($('#automotive [data-status="pilot"]')).toHaveLength(1);
  });

  it('states the human-review and no-guaranteed-fit boundaries', () => {
    const $ = localeHtml(typedLocale);

    expect($('#pilot').text()).toContain(expected.humanReview);
    expect($('#story [data-story-stage="candidates"]').text()).toContain(expected.noGuaranteedFit);
  });

  it('keeps source attribution and autonomous-action limits in the trust section', () => {
    const trustText = localeHtml(typedLocale)('#trust').text();

    for (const statement of expected.trustStatements) expect(trustText).toContain(statement);
  });

  it('gives the illustrative quote article its own heading', () => {
    expect(localeHtml(typedLocale)('#pilot article.quote-draft > header h3')).toHaveLength(1);
  });

  it('renders localized inert actions in both conversion moments', () => {
    const $ = localeHtml(typedLocale);
    const labels = $('.cta[aria-disabled="true"]').map((_, cta) => $(cta).text().trim()).get();

    expect($('.cta[aria-disabled="true"]')).toHaveLength(4);
    expect($('a.cta')).toHaveLength(0);
    expect(labels.filter((label) => label === expected.previewRequest)).toHaveLength(2);
    expect(labels.filter((label) => label === expected.previewSignIn)).toHaveLength(2);
  });

  it('exposes one accessible Flowsolve header name', () => {
    const $ = localeHtml(typedLocale);
    const brandNames = $('header [data-brand-name="Flowsolve"]');

    expect(brandNames).toHaveLength(1);
    expect(brandNames.text().trim()).toBe('Flowsolve');
    expect(brandNames.attr('aria-hidden')).not.toBe('true');
    expect($('header img[src$=".svg"][alt=""][aria-hidden="true"]')).toHaveLength(1);
  });

  it('orders the page landmarks', () => {
    const $ = localeHtml(typedLocale);
    const bodyLandmarks = $('body').children('header, main, footer').map((_, element) => element.tagName).get();

    expect(bodyLandmarks).toEqual(['header', 'main', 'footer']);
  });

  it('labels the site as a temporary non-transactional preview', () => {
    const $ = localeHtml(typedLocale);

    expect($('body > footer[data-site-footer]')).toHaveLength(1);
    expect($('body > footer').text()).toContain(expected.previewNotice);
  });

  it('reserves a fixed decorative poster shell', () => {
    const $ = localeHtml(typedLocale);
    const poster = $('#story #resolution-story > .story__visual > aside.scene-poster-shell[data-aspect-ratio="8/5"]');

    expect(poster).toHaveLength(1);
    expect($('main aside.scene-poster-shell')).toHaveLength(1);
    expect($('.hero .scene-poster-shell, .hero [data-poster-slot]')).toHaveLength(0);
    expect(poster.attr('style')).toBeUndefined();
    expect(poster.find('svg[aria-hidden="true"][focusable="false"]')).toHaveLength(1);
    expect(poster.find('svg text')).toHaveLength(0);
    expect($('body svg:not([aria-hidden="true"])')).toHaveLength(0);
  });

  it('keeps the poster first and hydrates the exact resolution story only near visibility', () => {
    const $ = localeHtml(typedLocale);
    const experience = $('#story > #resolution-story.story__experience');
    const visual = experience.children('.story__visual');
    const children = visual.children();
    const poster = children.filter('aside.scene-poster-shell');
    const island = children.filter('astro-island');

    expect(experience).toHaveLength(1);
    expect(visual).toHaveLength(1);
    expect(poster).toHaveLength(1);
    expect(poster.index()).toBeLessThan(island.index());
    expect(island.is('astro-island[client="visible"][component-export="ResolutionScene"]')).toBe(true);
    expect(island.attr('props')).toContain('resolution-story');
  });
});

describe('generated brand surfaces', () => {
  it('keeps canonical logo vectors font-free and ships deterministic preview assets', () => {
    const logoFiles = [
      'flowsolve-mark.svg',
      'flowsolve-logo-horizontal.svg',
      'flowsolve-logo-horizontal-reversed.svg',
      'flowsolve-logo-monochrome.svg',
      'flowsolve-app-icon.svg',
    ];

    for (const file of logoFiles) {
      const $ = load(readFileSync(join(projectRoot, 'public', 'brand', file), 'utf8'), { xmlMode: true });
      expect($('text')).toHaveLength(0);
    }

    const faviconPath = join(projectRoot, 'public', 'favicon.svg');
    const markPath = join(projectRoot, 'public', 'brand', 'flowsolve-mark.svg');
    const socialPath = join(projectRoot, 'public', 'flowsolve-og.png');
    expect(existsSync(faviconPath)).toBe(true);
    expect(existsSync(socialPath)).toBe(true);

    const favicon = load(readFileSync(faviconPath, 'utf8'), { xmlMode: true });
    const mark = load(readFileSync(markPath, 'utf8'), { xmlMode: true });
    expect(favicon('path').map((_, path) => favicon(path).attr('d')).get()).toEqual(
      mark('path').map((_, path) => mark(path).attr('d')).get(),
    );

    const social = readFileSync(socialPath);
    expect(social.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([social.readUInt32BE(16), social.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
