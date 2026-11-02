import { forwardRef, type ButtonHTMLAttributes, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import Button from '@mui/material/Button';

export interface AnimatedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  success?: boolean;
  /** Optional text announced when the button enters its loading or success state. */
  statusLabel?: string;
}

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton(
    {
      children,
      className,
      disabled,
      loading = false,
      success = false,
      statusLabel,
      value,
      onFocus,
      onBlur,
      onKeyDown,
      onKeyUp,
      onClick,
      type = 'button',
      'aria-busy': ariaBusy,
      ...props
    },
    ref,
  ) {
    const showSuccess = success && !loading;
    const classes = [
      'motion-button',
      loading && 'motion-button--loading',
      showSuccess && 'motion-button--success',
      className,
    ].filter(Boolean).join(' ');

    return (
      <Button
        {...props}
        ref={ref}
        type={type}
        variant={/primary|submit/.test(className || '') ? 'contained' : 'outlined'}
        color={/danger|destructive/.test(className || '') ? 'error' : 'secondary'}
        value={value === undefined ? undefined : String(value)}
        className={classes}
        disabled={disabled || loading}
        onFocus={event => onFocus?.(event as FocusEvent<HTMLButtonElement>)}
        onBlur={event => onBlur?.(event as FocusEvent<HTMLButtonElement>)}
        onKeyDown={onKeyDown ? event => onKeyDown(event as KeyboardEvent<HTMLButtonElement>) : undefined}
        onKeyUp={onKeyUp ? event => onKeyUp(event as KeyboardEvent<HTMLButtonElement>) : undefined}
        onClick={event => onClick?.(event as MouseEvent<HTMLButtonElement>)}
        aria-busy={loading || ariaBusy}
        data-loading={loading ? 'true' : undefined}
        data-success={showSuccess ? 'true' : undefined}
      >
        {loading && <span className="motion-button__spinner" aria-hidden="true" />}
        {showSuccess && (
          <svg
            className="motion-button__success-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 4 4 10-10" />
          </svg>
        )}
        <span className="motion-button__label">{children}</span>
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {(loading || showSuccess) ? statusLabel : undefined}
        </span>
      </Button>
    );
  },
);

export default AnimatedButton;
