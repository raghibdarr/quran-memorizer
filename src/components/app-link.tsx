'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { navTransitionTypes } from '@/lib/nav';

type Props = ComponentProps<typeof NextLink>;

/**
 * next/link that tags each navigation with its direction (push / pop / tab
 * switch — src/lib/nav.ts), so the screen transition matches where the user is
 * going. Every in-app link uses this; explicit `transitionTypes` still win.
 */
export default function Link({ transitionTypes, ...props }: Props) {
  const pathname = usePathname();
  const types = transitionTypes ?? (typeof props.href === 'string' ? navTransitionTypes(pathname, props.href) : undefined);
  return <NextLink {...props} transitionTypes={types} />;
}
