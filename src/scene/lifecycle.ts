export interface SceneLifecycleState {
  documentVisible: boolean;
  inViewport: boolean;
  contextLost: boolean;
}

export interface SceneLifecycleDecision {
  shouldRender: boolean;
  shouldInvalidate: boolean;
}

export function deriveSceneLifecycle(
  previous: SceneLifecycleState | null,
  current: SceneLifecycleState,
): SceneLifecycleDecision {
  const shouldRender = current.documentVisible && current.inViewport && !current.contextLost;
  const previouslyRendered = previous !== null
    && previous.documentVisible
    && previous.inViewport
    && !previous.contextLost;

  return {
    shouldRender,
    shouldInvalidate: shouldRender && !previouslyRendered,
  };
}
