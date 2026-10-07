import { useParams, useSearchParams } from 'react-router';
import { SearchPrompt } from './ZeroResults';
import type { ListingScopeRef } from '../../features/listing/params';
import { ListingPage } from './ListingPage';

// Listing routes (NAV-009, PLP-001). Keyed by scope so state never leaks between listings.
const Page = ({ scopeRef }: { scopeRef: ListingScopeRef }) => <ListingPage key={`${scopeRef.scope}:${scopeRef.node ?? ''}:${scopeRef.q ?? ''}`} scopeRef={scopeRef} />;

export function SectionListing() {
  const { section } = useParams();
  return <Page scopeRef={{ scope: 'node', node: section }} />;
}
export function NodeListing() {
  const { section, category, sub } = useParams();
  return <Page scopeRef={{ scope: 'node', node: [section, category, sub].filter(Boolean).join('/') }} />;
}
export const AllListing = () => <Page scopeRef={{ scope: 'all' }} />;
export const BestSellerListing = () => <Page scopeRef={{ scope: 'best-seller' }} />;
export const BankOfferListing = () => <Page scopeRef={{ scope: 'bank-offer' }} />;

export function SearchListing() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  return q ? <Page scopeRef={{ scope: 'search', q }} /> : <SearchPrompt />;
}
