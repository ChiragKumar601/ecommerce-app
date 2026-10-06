import { useQuery } from '@tanstack/react-query';
import { getJson } from '../lib/api-client';

type Health = { status: string; service: string; time: string };

/** Stage 0 skeleton page: proves the frontend reaches the backend through the dev proxy. */
export function HealthPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => getJson<Health>('/health') });

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Wardrobe & Co.</h1>
      <p className="mt-2">Project skeleton — Stage 0.</p>
      <p className="mt-4" data-testid="backend-status" role="status">
        {health.isPending && 'Checking backend…'}
        {health.isError && 'Backend unreachable'}
        {health.isSuccess && `Backend: ${health.data.status}`}
      </p>
    </main>
  );
}
