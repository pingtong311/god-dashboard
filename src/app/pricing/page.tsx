import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('pricing');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function PricingPage() {
  return <StaticPage page={page} />;
}
