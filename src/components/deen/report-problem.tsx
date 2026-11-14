'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/cn';
import { mailtoHref, reportMessage } from './text';

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

/** How a report can leave the device: email when a contact is set, else the share sheet */
function useChannel(): 'email' | 'share' | null {
  const [channel, setChannel] = useState<'email' | 'share' | null>(CONTACT ? 'email' : null);
  useEffect(() => {
    if (CONTACT) return;
    const can = Capacitor.isPluginAvailable('Share') || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection needs the browser
    if (can) setChannel('share');
  }, []);
  return channel;
}

/**
 * "Report a problem" (spec 5.6): a message prefilled with the item id and rev,
 * sent by email when NEXT_PUBLIC_CONTACT_EMAIL is set, else through the share
 * sheet. Hidden when neither exists. Nothing is sent without the user.
 */
export function ReportProblem({ itemId, rev, title, className }: { itemId: string; rev: number; title?: string; className?: string }) {
  const channel = useChannel();
  if (!channel) return null;
  const msg = reportMessage(itemId, rev, title);
  const classes = cn('inline-flex min-h-11 items-center text-xs font-semibold text-muted underline decoration-foreground/20 underline-offset-2 hover:text-foreground', className);

  if (channel === 'email' && CONTACT) {
    return (
      <a href={mailtoHref(CONTACT, msg)} className={classes} data-report-problem>
        Report a problem with this text
      </a>
    );
  }
  const share = async () => {
    const text = `${msg.subject}\n\n${msg.body}`;
    try {
      if (Capacitor.isPluginAvailable('Share')) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: msg.subject, text, dialogTitle: 'Report a problem' });
      } else {
        await navigator.share({ title: msg.subject, text });
      }
    } catch {
      // Closing the share sheet is not an error
    }
  };
  return (
    <button type="button" onClick={share} className={classes} data-report-problem>
      Report a problem with this text
    </button>
  );
}

export default ReportProblem;
