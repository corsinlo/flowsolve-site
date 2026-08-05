// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeStoryProgress } from './story-progress';

afterEach(() => vi.restoreAllMocks());

describe('observeStoryProgress', () => {
  it('schedules the initial publish after listener registration, coalesces scroll work, and ignores immaterial changes', () => {
    let frame: FrameRequestCallback | undefined;
    const add = vi.spyOn(window, 'addEventListener');
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
      expect(add).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
      frame = callback;
      return 42;
    });
    vi.spyOn(window, 'cancelAnimationFrame');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    const story = document.createElement('section');
    let top = 0;
    vi.spyOn(story, 'getBoundingClientRect').mockImplementation(() => ({
      top, height: 1_000,
    }) as DOMRect);
    const publish = vi.fn();

    const stop = observeStoryProgress(story, publish);

    expect(publish).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    frame?.(0);
    expect(publish).toHaveBeenLastCalledWith(0);

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(requestFrame).toHaveBeenCalledTimes(2);

    top = -100;
    frame?.(0);
    expect(publish).toHaveBeenLastCalledWith(0.2);

    top = -100.25;
    window.dispatchEvent(new Event('resize'));
    frame?.(0);
    expect(publish).toHaveBeenCalledTimes(2);
    stop();
  });

  it('registers passive listeners and cancels pending work on cleanup', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(9);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const story = document.createElement('section');
    vi.spyOn(story, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 500 } as DOMRect);

    const stop = observeStoryProgress(story, vi.fn());
    stop();

    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(cancel).toHaveBeenCalledWith(9);
  });
});
