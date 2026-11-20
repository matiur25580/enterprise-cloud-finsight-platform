import { claimNextCloudSyncJob, processCloudSyncJob } from "../src/lib/cloud-sync/worker";
import { prisma } from "../src/lib/prisma";

let stopping = false;
let active = false;
const shutdown = () => { stopping = true; };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function main() {
  process.stdout.write("FinSight cloud sync worker started.\n");
  try {
    while (!stopping) {
      if (!active) {
        active = true;
        try {
          const job = await claimNextCloudSyncJob();
          if (job) {
            process.stdout.write("Processing cloud sync job " + job.id + ".\n");
            await processCloudSyncJob(job);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } finally { active = false; }
      }
    }
  } finally {
    await prisma.$disconnect();
    process.stdout.write("FinSight cloud sync worker stopped.\n");
  }
}
main().catch(async (error) => { process.stderr.write(String(error) + "\n"); await prisma.$disconnect(); process.exitCode = 1; });
