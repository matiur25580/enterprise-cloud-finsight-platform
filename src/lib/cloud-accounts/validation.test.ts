import test from "node:test";
import assert from "node:assert/strict";
import { createCloudAccountSchema, updateCloudAccountSchema } from "./validation";
test("accepts AWS, Azure and GCP account metadata", () => { for (const provider of ["AWS", "AZURE", "GCP"] as const) assert.equal(createCloudAccountSchema.safeParse({ provider, externalAccountId: "acct-123", name: "Production", currency: "usd" }).success, true); });
test("rejects credential values in place of secret references", () => { assert.equal(createCloudAccountSchema.safeParse({ provider: "AWS", externalAccountId: "123", name: "Production", currency: "USD", credentialRef: "AKIA123456789" }).success, false); });
test("requires update fields and validates lifecycle status", () => { assert.equal(updateCloudAccountSchema.safeParse({}).success, false); assert.equal(updateCloudAccountSchema.safeParse({ status: "PAUSED" }).success, true); assert.equal(updateCloudAccountSchema.safeParse({ status: "CONNECTED" }).success, false); });
