import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { buildLegalMetadata, getLegalPage } from '@/lib/legalPages';

/**
 * 峰子 /terms — 複刻博主 /terms.html（服務條款）。
 *
 * 此路由在 src/lib/shellRoutes.ts 的 NO_SHELL_EXACT 內（ShellKind='none'），
 * 故 <Navigation /> / <SiteFooter /> / <MobileTaskbar /> 皆回傳 null，
 * 與博主原頁「完全沒有導覽外殼」一致。
 */
const page = getLegalPage('terms');

export const metadata: Metadata = buildLegalMetadata(page);

export default function TermsPage() {
  return <LegalPage page={page} />;
}
