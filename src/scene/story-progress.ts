export type ProgressPublisher = (progress: number) => void;

const MATERIAL_CHANGE = 0.001;

function normalizedProgress(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const travel = Math.max(1, rect.height - window.innerHeight);
  return Math.min(1, Math.max(0, -rect.top / travel));
}

export function observeStoryProgress(
  element: HTMLElement,
  publish: ProgressPublisher,
): () => void {
  let frame: number | undefined;
  let lastProgress = Number.NaN;

  const measure = () => {
    frame = undefined;
    const progress = normalizedProgress(element);
    if (!Number.isFinite(lastProgress) || Math.abs(progress - lastProgress) >= MATERIAL_CHANGE) {
      lastProgress = progress;
      publish(progress);
    }
  };

  const schedule = () => {
    if (frame === undefined) frame = window.requestAnimationFrame(measure);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };
}
