import { claimNextCloudSyncJob, processCloudSyncJob } from "../src/lib/cloud-sync/worker";
import { prisma } from "../src/lib/prisma";
import { enqueueDueScheduledSyncs } from "../src/lib/cloud-sync/queue";

let stopping = false;
let active = false;
const shutdown = () => { stopping = true; };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function main() {
  process.stdout.write("FinSight cloud sync worker started.
");
  try {
    while (!stopping) {
      if (!active) {
        active = true;
        try {
          const scheduled = await enqueueDueScheduledSyncs();
          if (scheduled > 0) process.stdout.write("Queued " + scheduled + " scheduled sync job(s).
");
          const job = await claimNextCloudSyncJob();
          if (job) {
            process.stdout.write("Processing cloud sync job " + job.id + ".
");
            await processCloudSyncJob(job);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } finally { active = false; }
      }
    }
  } finally {
    await prisma.$disconnect();
    process.stdout.write("FinSight cloud sync worker stopped.
");
  }
}
main().catch(async (error) => { process.stderr.write(String(error) + "
"); await prisma.$disconnect(); process.exitCode = 1; });
