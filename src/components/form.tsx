"use client";

import { useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./ui";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Variant = "primary" | "secondary" | "ghost" | "danger";

// Form wrapper for server actions: shows the returned error or success message.
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showOk = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {showOk && state?.ok && <p className="mt-2 text-sm text-success">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className}>
      {pending ? (pendingText ?? "Saving...") : children}
    </Button>
  );
}

// Submits the surrounding form as soon as the value changes.
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function AutoSubmitCheckbox(props: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

export function ConfirmButton({
  children,
  message,
  variant = "danger",
  size = "sm",
}: {
  children: ReactNode;
  message: string;
  variant?: Variant;
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
