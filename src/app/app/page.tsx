import type { Metadata } from 'next';
import StaticPage, { buildStaticPageMetadata } from '@/components/StaticPage';
import { getStaticPage } from '@/lib/staticPages';

const page = getStaticPage('app');

export const metadata: Metadata = buildStaticPageMetadata(page);

export default function AppInstallPage() {
  return <StaticPage page={page} />;
}
