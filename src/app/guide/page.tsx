import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('guide');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function GuidePage() {
  return <StaticPage page={page} />;
}
