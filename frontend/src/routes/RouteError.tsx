import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ApiError } from '../lib/api-client';
import { ErrorState, PageLayout } from '../components/ui';
import { NotFound } from './NotFound';

/** Route error element: 404s render Not found; anything else a retryable error (GLB-002, GLB-003). */
export function RouteError() {
  const err = useRouteError();
  const notFound = (isRouteErrorResponse(err) && err.status === 404) || (err instanceof ApiError && err.code === 'NOT_FOUND');
  if (notFound) return <NotFound />;
  return (
    <PageLayout>
      <ErrorState message={err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'} onRetry={() => window.location.reload()} />
    </PageLayout>
  );
}
