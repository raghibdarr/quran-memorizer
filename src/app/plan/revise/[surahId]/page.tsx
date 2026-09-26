import { surahIdParams } from '@/lib/static-params';
import RevisePage from './revise-client';

export const dynamicParams = false;
export const generateStaticParams = surahIdParams;

export default function Page() {
  return <RevisePage />;
}
