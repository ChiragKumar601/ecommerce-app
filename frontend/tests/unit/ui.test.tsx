import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, EmptyState, ErrorState, FormField, Input, PriceTag, RatingBadge } from '../../src/components/ui';
import { compactCount, formatINR } from '../../src/lib/format';

describe('ui primitives (plan §8.5)', () => {
  it('Button shows a spinner and blocks double submission while loading (GLB-004)', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Pay</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} loading>Pay</Button>);
    const btn = screen.getByRole('button', { name: /Pay/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('FormField links label, hint and error to the control (AUTH-016, FE-004)', () => {
    render(<FormField label="Pincode" hint="6 digits" error="Enter a valid 6-digit pincode"><Input /></FormField>);
    const input = screen.getByLabelText('Pincode');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid 6-digit pincode');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid 6-digit pincode');
  });

  it('PriceTag shows price, struck MRP and discount only when discounted (PLP-012)', () => {
    const m = (p: number) => ({ paise: p, display: formatINR(p) });
    const { rerender, container } = render(<PriceTag price={m(99900)} mrp={m(149900)} discountPercent={33} />);
    expect(container).toHaveTextContent('₹999');
    expect(container.querySelector('s')).toHaveTextContent('₹1,499');
    expect(container).toHaveTextContent('(33% OFF)');
    rerender(<PriceTag price={m(71900)} mrp={m(71900)} discountPercent={0} />);
    expect(container.querySelector('s')).toBeNull();
    expect(container).not.toHaveTextContent('OFF');
  });

  it('RatingBadge shows the average and a compact count with an accessible label (PLP-011)', () => {
    render(<RatingBadge average={4.26} count={1234} />);
    const badge = screen.getByLabelText('Rated 4.3 out of 5 by 1234 customers');
    expect(badge).toHaveTextContent('4.3');
    expect(badge).toHaveTextContent('| 1.2k');
  });

  it('EmptyState and ErrorState render their states (GLB-002)', async () => {
    const retry = vi.fn();
    render(<><EmptyState title="Your bag is empty" /><ErrorState message="Something went wrong. Please try again." onRetry={retry} /></>);
    expect(screen.getByRole('heading', { name: 'Your bag is empty' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('display formatting parity with the backend (SD-01)', () => {
  it('matches the backend money format on the same examples', () => {
    // Same cases as backend/tests/unit/domain/money.test.ts.
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(85011)).toBe('₹850.11');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(100000)).toBe('₹1,000');
    expect(formatINR(1234567890)).toBe('₹1,23,45,678.90');
    expect(formatINR(-30000)).toBe('−₹300');
  });
  it('compacts counts', () => {
    expect(compactCount(950)).toBe('950');
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1234)).toBe('1.2k');
    expect(compactCount(25890)).toBe('25.8k');
  });
});

describe('cn() with the custom type scale', () => {
  it('keeps the text colour alongside a custom font size (regression: invisible button labels)', async () => {
    const { cn } = await import('../../src/lib/cn');
    expect(cn('bg-ink text-white', 'text-body')).toBe('bg-ink text-white text-body');
    expect(cn('text-small', 'text-body')).toBe('text-body');
    expect(cn('text-ink', 'text-white')).toBe('text-white');
  });
});
