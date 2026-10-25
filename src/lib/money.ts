export function money(amount: number | string | null | undefined, currency = "USD") {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const INVOICE_STATUS = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "danger" },
} as const;
