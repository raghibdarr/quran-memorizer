import { essentialCollectionParams } from '@/lib/static-params';
import CollectionPage from './collection-client';

export const dynamicParams = false;
export const generateStaticParams = essentialCollectionParams;

export default function Page() {
  return <CollectionPage />;
}
