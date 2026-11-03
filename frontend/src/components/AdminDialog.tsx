import { useLayoutEffect, useRef, type ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import { FilterSelect } from './ui/FilterSelect';

/** Administration forms use the shared Berry selector with a value callback. */
export function AdminSelect({ onValueChange, ...props }: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  id?: string;
  'aria-label': string;
}) {
  return <FilterSelect {...props} onChange={(event) => onValueChange(event.target.value)} />;
}

/** Material UI owns the overlay's focus scope, Escape handling, scroll lock, and restoration. */
export function AdminDialog({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // For destructive confirmation, the neutral action receives initial focus.
  useLayoutEffect(() => {
    if (!/hapus|keluar/i.test(label)) return;
    const frame = requestAnimationFrame(() => {
      const cancel = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find(button => button.textContent?.trim() === 'Batal');
      cancel?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [label]);

  return (
    <Dialog open onClose={(_event, reason) => { if (reason !== 'backdropClick') onClose(); }}
      aria-label={label} fullWidth maxWidth="md" scroll="paper"
      slotProps={{ transition: { onEntered: () => {
        const dialog = dialogRef.current;
        const cancel = /hapus|keluar/i.test(label) ? Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(button => button.textContent?.trim() === 'Batal') : undefined;
        const first = dialog?.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled]),[tabindex="0"]');
        (cancel || first || dialog)?.focus();
      } }, paper: { className: 'sapa-admin-dialog', sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100dvh - 32px)' } } }}>
      <div ref={dialogRef} tabIndex={-1} className="sapa-admin-dialog-content min-w-0">{children}</div>
    </Dialog>
  );
}
