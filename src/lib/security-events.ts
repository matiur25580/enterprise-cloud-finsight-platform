export type SecurityEventRecord = {
  id: string;
  routeBucket: string;
  requestCount: number;
  requestLimit: number;
  createdAt: Date;
};

export function summarizeSecurityEvents(events: SecurityEventRecord[], now = new Date()) {
  const byRoute = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const event of events) {
    byRoute.set(event.routeBucket, (byRoute.get(event.routeBucket) ?? 0) + 1);
    const day = event.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - index)));
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: byDay.get(key) ?? 0 };
  });
  return {
    total: events.length,
    routes: [...byRoute.entries()]
      .map(([routeBucket, count]) => ({ routeBucket, count }))
      .sort((a, b) => b.count - a.count || a.routeBucket.localeCompare(b.routeBucket)),
    days,
    latestAt: events[0]?.createdAt ?? null
  };
}
