import { existsSync, globSync, readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;
const htmlFiles = globSync('dist/**/*.html', { cwd: projectRoot });
const emittedCss = globSync('dist/**/*.css', { cwd: projectRoot })
  .map((cssFile) => readFileSync(new URL(`../../${cssFile}`, import.meta.url), 'utf8'))
  .join('\n');

it('generates at least one HTML artifact', () => {
  expect(htmlFiles.length).toBeGreaterThan(0);
});

describe.each(htmlFiles)('%s security metadata', (htmlFile) => {
  const $ = load(readFileSync(new URL(`../../${htmlFile}`, import.meta.url), 'utf8'));

  it('blocks indexing and referrer disclosure', () => {
    expect($('meta[name="robots"]').attr('content')).toBe('noindex,nofollow');
    expect($('meta[name="referrer"]').attr('content')).toBe('no-referrer');
  });

  it('enforces the hashed static-preview content security policy', () => {
    const csp = $('meta[http-equiv="content-security-policy" i]').attr('content') ?? '';

    for (const directive of [
      "default-src 'self'",
      "connect-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
    ]) expect(csp).toContain(directive);
    expect(csp).toMatch(/script-src[^;]*'sha256-/);
    expect(csp).toMatch(/style-src[^;]*'sha256-/);
  });

  it('contains no inline style attributes', () => {
    expect($('[style]')).toHaveLength(0);
  });
});

it('does not publish a sitemap', () => {
  expect(existsSync(new URL('../../dist/sitemap.xml', import.meta.url))).toBe(false);
});

it('emits the required scene geometry without inline styles', () => {
  const dom = new JSDOM('<!doctype html><aside class="scene-poster-shell"></aside><div class="resolution-scene"></div><div data-resolution-scene-sentinel></div>');
  const stylesheet = dom.window.document.createElement('style');
  stylesheet.textContent = emittedCss;
  dom.window.document.head.append(stylesheet);

  const computed = (selector: string) => dom.window.getComputedStyle(
    dom.window.document.querySelector(selector) as Element,
  );
  const poster = computed('.scene-poster-shell');
  expect({
    position: poster.position,
    width: poster.width,
    aspectRatio: poster.getPropertyValue('aspect-ratio'),
  }).toEqual({
    position: 'relative',
    width: '100%',
    aspectRatio: '8/5',
  });

  for (const selector of ['.resolution-scene', '[data-resolution-scene-sentinel]']) {
    const scene = computed(selector);
    expect({
      position: scene.position,
      top: scene.top,
      left: scene.left,
      width: scene.width,
      aspectRatio: scene.getPropertyValue('aspect-ratio'),
      pointerEvents: scene.pointerEvents,
    }).toEqual({
      position: 'absolute',
      top: '0px',
      left: '0px',
      width: '100%',
      aspectRatio: '8/5',
      pointerEvents: 'none',
    });
  }
});
