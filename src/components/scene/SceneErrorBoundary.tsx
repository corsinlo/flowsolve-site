import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onFailure: () => void;
}

interface State {
  failed: boolean;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onFailure();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
