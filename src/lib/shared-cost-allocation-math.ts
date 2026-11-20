export type AllocationRecipient = { value: string; weight?: number };
export type SharedCostMethod = "EQUAL" | "WEIGHTED";

export function validateAllocationRecipients(method: SharedCostMethod, recipients: AllocationRecipient[]) {
  if (recipients.length < 2 || recipients.length > 50) return "Provide between 2 and 50 recipients.";
  if (new Set(recipients.map((item) => item.value.trim().toLowerCase())).size !== recipients.length) return "Recipient values must be unique.";
  if (recipients.some((item) => !item.value.trim() || item.value.trim().length > 120)) return "Recipient names must be 1–120 characters.";
  if (method === "WEIGHTED") {
    if (recipients.some((item) => typeof item.weight !== "number" || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 100)) return "Each weighted recipient needs a weight greater than 0 and at most 100.";
    const total = recipients.reduce((sum, item) => sum + (item.weight ?? 0), 0);
    if (Math.abs(total - 100) > 0.000001) return "Weighted recipient percentages must total exactly 100%.";
  }
  return null;
}

export function distributeSharedCost(total: number, method: SharedCostMethod, recipients: AllocationRecipient[]) {
  if (!Number.isFinite(total)) throw new Error("Shared cost must be finite.");
  const error = validateAllocationRecipients(method, recipients);
  if (error) throw new Error(error);
  const result = recipients.map((recipient) => ({
    recipient: recipient.value.trim(),
    weightPercent: method === "EQUAL" ? 100 / recipients.length : recipient.weight!,
    amount: 0
  }));
  let allocated = 0;
  result.forEach((item, index) => {
    const amount = index === result.length - 1
      ? Number((total - allocated).toFixed(8))
      : Number((total * (item.weightPercent / 100)).toFixed(8));
    item.amount = amount;
    allocated = Number((allocated + amount).toFixed(8));
  });
  return result;
}
