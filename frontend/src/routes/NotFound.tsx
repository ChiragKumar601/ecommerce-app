import { Search } from 'lucide-react';
import { Form, Link } from 'react-router';
import { Button, EmptyState, Input, PageLayout } from '../components/ui';

/** Page not found, with search and a link home (GLB-005). */
export function NotFound() {
  return (
    <PageLayout narrow>
      <EmptyState
        icon={<Search className="size-7" aria-hidden="true" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or is no longer available. Try a search instead."
        action={
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Form action="/search" method="get" role="search" className="flex gap-2">
              <label htmlFor="nf-q" className="sr-only">Search products</label>
              <Input id="nf-q" name="q" placeholder="Search for products, brands and more" maxLength={100} />
              <Button type="submit">Search</Button>
            </Form>
            <Button asChild variant="secondary"><Link to="/">Go to the home page</Link></Button>
          </div>
        }
      />
    </PageLayout>
  );
}
