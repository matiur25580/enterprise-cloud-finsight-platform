let stopping = false;
const shutdown = () => { stopping = true; };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Run scheduled and queued sync work under the dedicated, least-privilege worker database role.
async function main() {
  const workerDatabaseUrl = process.env.SYNC_WORKER_DATABASE_URL;
  if (!workerDatabaseUrl) throw new Error("SYNC_WORKER_DATABASE_URL is required for the isolated sync worker database role.");
  process.env.DATABASE_URL = workerDatabaseUrl;

  const [{ claimNextCloudSyncJob, processCloudSyncJob }, { prisma }, { enqueueDueScheduledSyncs }] = await Promise.all([
    import("../src/lib/cloud-sync/worker"),
    import("../src/lib/prisma"),
    import("../src/lib/cloud-sync/queue")
  ]);

  process.stdout.write("FinSight cloud sync worker started.\n");
  try {
    while (!stopping) {
      const scheduled = await enqueueDueScheduledSyncs();
      if (scheduled > 0) process.stdout.write("Queued " + scheduled + " scheduled sync job(s).\n");
      const job = await claimNextCloudSyncJob();
      if (job) {
        process.stdout.write("Processing cloud sync job " + job.id + ".\n");
        await processCloudSyncJob(job);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  } finally {
    await prisma.$disconnect();
    process.stdout.write("FinSight cloud sync worker stopped.\n");
  }
}

main().catch(async (error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
