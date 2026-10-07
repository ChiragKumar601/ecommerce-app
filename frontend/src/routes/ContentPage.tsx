import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Badge, Breadcrumbs, PageLayout } from '../components/ui';
import { renderMarkdown } from '../lib/markdown';
import { pageQuery } from '../features/content';

/** Content and policy pages, labelled when placeholder (LND-008, PRV-004). */
export function ContentPage() {
  const { slug } = useParams();
  const { data } = useSuspenseQuery(pageQuery(slug!));
  return (
    <PageLayout narrow>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: data.title }]} />
      <article className="rounded-xl border border-line bg-surface p-6 md:p-10">
        {data.isPlaceholder && <Badge tone="warning" size="md" className="mb-4">Placeholder content</Badge>}
        <h1 className="mb-6 text-h1 font-bold">{data.title}</h1>
        {renderMarkdown(data.body)}
      </article>
    </PageLayout>
  );
}
