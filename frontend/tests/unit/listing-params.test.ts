import { beforeEach, describe, expect, it } from 'vitest';
import { apiQuery, carriedParams, clearAll, getList, listingParams, paramsFromApplied, rememberListing, setList } from '../../src/features/listing/params';

const empty = { gender: [], category: [], brand: [], colour: [], size: [], inStock: false, bankOffer: false, inclusiveSizing: false };

describe('listing URL state (PLP-006, PLP-008, PLP-009)', () => {
  beforeEach(() => sessionStorage.clear());

  it('keeps only listing keys, sorted, and builds the API query with the scope', () => {
    const p = listingParams(new URLSearchParams('utm=x&sort=new&brand=a,b'));
    expect(p.toString()).toBe('brand=a%2Cb&sort=new');
    expect(apiQuery({ scope: 'node', node: 'men/topwear' }, p, { cursor: 'MjQ' })).toBe('brand=a%2Cb&sort=new&scope=node&node=men%2Ftopwear&cursor=MjQ');
  });

  it('adds and removes list values', () => {
    let p = setList(new URLSearchParams(), 'size', ['M', 'L']);
    expect(getList(p, 'size')).toEqual(['M', 'L']);
    p = setList(p, 'size', []);
    expect(p.has('size')).toBe(false);
  });

  it('Clear all keeps only the sort', () => {
    expect(clearAll(new URLSearchParams('brand=a&inStock=1&sort=price_asc')).toString()).toBe('sort=price_asc');
  });

  it('canonical params from applied filters; bank-offer removal is explicit', () => {
    expect(paramsFromApplied({ ...empty, brand: ['k'], priceMin: 500, inStock: true }, 'new', 'node').toString()).toBe('brand=k&inStock=1&priceMin=500&sort=new');
    expect(paramsFromApplied({ ...empty, bankOffer: false }, null, 'bank-offer').toString()).toBe('bankOffer=0');
    expect(paramsFromApplied({ ...empty, bankOffer: true }, null, 'bank-offer').toString()).toBe('');
  });

  it('carries shared filters and sort only to a different listing in the same section', () => {
    rememberListing('men', '/men/topwear', new URLSearchParams('brand=k&category=men/topwear/t-shirts&gender=men&sort=new'));
    expect(carriedParams('men', '/men/bottomwear')?.toString()).toBe('brand=k&sort=new');
    expect(carriedParams('men', '/men/topwear')).toBeNull();
    expect(carriedParams('women', '/shop/women')).toBeNull();
    rememberListing(null, '/shop/all', new URLSearchParams('brand=k'));
    expect(carriedParams('men', '/men/bottomwear')).toBeNull();
  });
});
