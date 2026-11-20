import { z } from "zod";

export const cloudProviderSchema = z.enum(["AWS", "AZURE", "GCP"]);
export const cloudAccountStatusSchema = z.enum(["ACTIVE", "PAUSED", "ERROR"]);
const secretReference = z.string().trim().max(500).regex(/^[a-z][a-z0-9+.-]*:\/\/.+$/i, "Use a secret-manager reference URI, not a credential value.").optional().or(z.literal(""));
export const createCloudAccountSchema = z.object({ provider: cloudProviderSchema, externalAccountId: z.string().trim().min(1).max(255), name: z.string().trim().min(2).max(120), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), credentialRef: secretReference });
export const updateCloudAccountSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(), status: cloudAccountStatusSchema.optional(), credentialRef: z.union([z.string().trim().max(500).regex(/^[a-z][a-z0-9+.-]*:\/\/.+$/i), z.literal(""), z.null()]).optional() }).refine((value) => Object.keys(value).length > 0, "At least one field is required.");
