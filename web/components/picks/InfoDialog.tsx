"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function InfoDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="native-info-dialog"
      aria-label="Pick information"
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        aria-label="Close pick information"
        className="native-info-close"
        onClick={onClose}
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
