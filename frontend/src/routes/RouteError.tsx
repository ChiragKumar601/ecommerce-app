import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ApiError } from '../lib/api-client';
import { ErrorState } from '../components/ui/feedback';
import { PageLayout } from '../components/ui/layout';
import { NotFound } from './NotFound';
import { useDocumentTitle } from '../components/layout/Seo';

/** Route error element: 404s render Not found; anything else a retryable error (GLB-002, GLB-003). */
export function RouteError() {
  const err = useRouteError();
  const notFound = (isRouteErrorResponse(err) && err.status === 404) || (err instanceof ApiError && err.code === 'NOT_FOUND');
  if (notFound) return <NotFound />;
  return <ErrorPage message={err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'} />;
}

function ErrorPage({ message }: { message: string }) {
  useDocumentTitle('Something went wrong');
  return (
    <PageLayout>
      <ErrorState message={message} onRetry={() => window.location.reload()} />
    </PageLayout>
  );
}
