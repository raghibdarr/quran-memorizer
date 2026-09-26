import { juzParams } from '@/lib/static-params';
import JuzDetailPage from './juz-client';

export const dynamicParams = false;
export const generateStaticParams = juzParams;

export default function Page() {
  return <JuzDetailPage />;
}
