import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('about');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function AboutPage() {
  return <StaticPage page={page} />;
}
