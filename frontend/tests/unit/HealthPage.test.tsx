import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPage } from '../../src/routes/HealthPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HealthPage />
    </QueryClientProvider>,
  );
}

describe('HealthPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the backend status from /api/v1/health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'ok', service: 'backend', time: '' }))));
    renderPage();
    expect(await screen.findByText('Backend: ok')).toBeInTheDocument();
  });

  it('shows an error state when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    renderPage();
    expect(await screen.findByText('Backend unreachable')).toBeInTheDocument();
  });
});
