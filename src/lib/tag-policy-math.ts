export type TagPolicyInput = {
  tagKey: string;
  displayName: string;
  isRequired: boolean;
  allowedValues: string[];
};

export type TagPolicyViolation = {
  policyKey: string;
  displayName: string;
  missing: boolean;
  invalid: boolean;
};

export function evaluateTagPolicies(tags: Record<string, unknown>, policies: TagPolicyInput[]): TagPolicyViolation[] {
  const normalizedTags = new Map(Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]));
  return policies.flatMap((policy) => {
    const raw = normalizedTags.get(policy.tagKey.toLowerCase());
    const value = typeof raw === "string" ? raw.trim() : "";
    const missing = policy.isRequired && value.length === 0;
    const invalid = value.length > 0 && policy.allowedValues.length > 0
      && !policy.allowedValues.some((allowed) => allowed.toLowerCase() === value.toLowerCase());
    return missing || invalid ? [{ policyKey: policy.tagKey, displayName: policy.displayName, missing, invalid }] : [];
  });
}
