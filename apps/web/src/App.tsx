import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { AppRouter } from '@/router';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
