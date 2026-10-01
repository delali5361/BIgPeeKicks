import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type BusyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy: boolean;
  children: ReactNode;
};

export function BusyButton({ busy, children, disabled, className = "", ...props }: BusyButtonProps) {
  return (
    <button {...props} disabled={disabled || busy} aria-busy={busy} className={className}>
      {busy && <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
