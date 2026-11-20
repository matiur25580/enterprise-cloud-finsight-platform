import test from "node:test";
import assert from "node:assert/strict";
import { hasAnyRole, hasPermission } from "./permissions";

test("viewer can read but cannot import billing data", () => {
  assert.equal(hasPermission("VIEWER", "billing:read"), true);
  assert.equal(hasPermission("VIEWER", "billing:import"), false);
});

test("FinOps analyst can import billing data and review recommendations", () => {
  assert.equal(hasPermission("FINOPS_ANALYST", "billing:import"), true);
  assert.equal(hasPermission("FINOPS_ANALYST", "recommendations:review"), true);
  assert.equal(hasPermission("FINOPS_ANALYST", "members:manage"), false);
});

test("owner can manage organization and members", () => {
  assert.equal(hasPermission("OWNER", "organization:manage"), true);
  assert.equal(hasPermission("OWNER", "members:manage"), true);
});

test("role checks accept only explicitly allowed roles", () => {
  assert.equal(hasAnyRole("ADMIN", ["OWNER", "ADMIN"]), true);
  assert.equal(hasAnyRole("VIEWER", ["OWNER", "ADMIN"]), false);
});
