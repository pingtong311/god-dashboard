import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('manual');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function ManualPage() {
  return <StaticPage page={page} />;
}
