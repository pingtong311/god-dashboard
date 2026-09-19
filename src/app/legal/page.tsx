import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('legal');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function LegalPage() {
  return <StaticPage page={page} />;
}
