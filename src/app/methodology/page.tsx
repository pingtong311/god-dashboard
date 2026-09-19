import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('methodology');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function MethodologyPage() {
  return <StaticPage page={page} />;
}
