import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error == null) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="card w-full max-w-md border border-red-500/30">
          <h2 className="text-lg font-semibold text-ink-100 light:text-ink-900">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-ink-400">{error.message}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={this.reset}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
