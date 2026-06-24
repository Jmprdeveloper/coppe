"use client";

import { useEffect, type ReactNode } from "react";

type AutoDismissAlertVariant = "success" | "error";

type AutoDismissAlertProps = {
  message: string;
  onDismiss: () => void;
  className?: string;
  children?: ReactNode;
  durationMs?: number;
  fadeOutMs?: number;
  variant?: AutoDismissAlertVariant;
};

const autoDismissAlertFadeOutStyle = `
@keyframes coppe-auto-dismiss-alert-fade-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}
`;

const alertClassNames: Record<AutoDismissAlertVariant, string> = {
  success:
    "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700",
  error:
    "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700",
};

export function AutoDismissAlert({
  message,
  onDismiss,
  className = "",
  children,
  durationMs = 4200,
  fadeOutMs = 350,
  variant = "success",
}: AutoDismissAlertProps) {
  useEffect(() => {
    if (!message) {
      return;
    }

    const dismissTimer = window.setTimeout(() => {
      onDismiss();
    }, durationMs);

    return () => {
      window.clearTimeout(dismissTimer);
    };
  }, [durationMs, message, onDismiss]);

  if (!message) {
    return null;
  }

  const fadeDelayMs = Math.max(durationMs - fadeOutMs, 0);

  return (
    <>
      <style>{autoDismissAlertFadeOutStyle}</style>

      <div
        role={variant === "error" ? "alert" : "status"}
        aria-live={variant === "error" ? "assertive" : "polite"}
        className={`${alertClassNames[variant]} ${className}`.trim()}
        style={{
          animation: `coppe-auto-dismiss-alert-fade-out ${fadeOutMs}ms ease-in forwards`,
          animationDelay: `${fadeDelayMs}ms`,
        }}
      >
        {children ?? message}
      </div>
    </>
  );
}
