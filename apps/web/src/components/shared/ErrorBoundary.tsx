import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
          <p className="text-sm font-medium text-foreground">Algo deu errado.</p>
          <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
