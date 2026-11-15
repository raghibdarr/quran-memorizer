'use client';

import RouteError from '@/components/ui/route-error';
import { PRAYER_STORE_KEY } from '@/stores/prayer-store';

/** Prayer screens: a damaged settings value can be cleared here without clearing site data */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      resetStore={{
        key: PRAYER_STORE_KEY,
        label: 'Reset prayer settings',
        note: 'Method, Asr, adjustments and alerts go back to the defaults. Your place and your prayer log stay.',
      }}
    />
  );
}
