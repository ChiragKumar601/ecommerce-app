import { PageLayout } from '../components/ui';

/** Landing page placeholder; the full landing page arrives in Stage 7. */
export function Home() {
  return (
    <PageLayout>
      <h1 className="text-h1 font-bold">Wardrobe & Co.</h1>
      <p className="mt-2 text-ink-muted">Fashion, beauty and home for everyone. The full store opens stage by stage.</p>
    </PageLayout>
  );
}
