import assert from "node:assert/strict";
import test from "node:test";
import { updateClaimedCloudSyncJob } from "./attempt-fence";

const job = { id: "job-1", organization_id: "org-1", attempt_count: 3 };

test("fences updates to the current running attempt and tenant", async () => {
  let received: unknown;
  const tx = {
    cloudSyncJob: {
      updateMany: async (args: unknown) => {
        received = args;
        return { count: 1 };
      }
    }
  };

  const updated = await updateClaimedCloudSyncJob(tx as never, job, { status: "SUCCEEDED" });

  assert.equal(updated, true);
  assert.deepEqual(received, {
    where: {
      id: "job-1",
      organizationId: "org-1",
      status: "RUNNING",
      attemptCount: 3
    },
    data: { status: "SUCCEEDED" }
  });
});

test("rejects stale workers when the attempt has already been reclaimed", async () => {
  const tx = {
    cloudSyncJob: {
      updateMany: async () => ({ count: 0 })
    }
  };

  assert.equal(await updateClaimedCloudSyncJob(tx as never, job, { status: "FAILED" }), false);
});
