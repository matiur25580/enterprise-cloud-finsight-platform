export type SyncAlertOutcome = {
  status: "FAILED" | "BLOCKED" | "RECOVERED";
  provider: string;
  accountName: string;
  errorCode?: string | null;
  attemptCount: number;
  importedRows?: number;
  rejectedRows?: number;
  duplicateRows?: number;
};

type AlertEnvironment = Record<string, string | undefined>;
type Fetcher = typeof fetch;

function slackWebhookUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function emailAddresses(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

function alertText(alert: SyncAlertOutcome): string {
  const headline = alert.status === "RECOVERED" ? "Cloud billing sync recovered" : "Cloud billing sync needs attention";
  return [
    headline,
    `Account: ${alert.accountName} (${alert.provider})`,
    `Status: ${alert.status}`,
    `Error code: ${alert.errorCode ?? "none"}`,
    `Attempt: ${alert.attemptCount}`,
    `Rows imported/rejected/duplicate: ${alert.importedRows ?? 0}/${alert.rejectedRows ?? 0}/${alert.duplicateRows ?? 0}`
  ].join("\n");
}

/** Best-effort worker-side delivery. Delivery failures never change a billing job's outcome. */
export async function deliverSyncAlert(
  alert: SyncAlertOutcome,
  fetcher: Fetcher = fetch,
  env: AlertEnvironment = process.env
): Promise<{ attempted: number; delivered: number }> {
  const text = alertText(alert);
  const tasks: Promise<unknown>[] = [];
  const webhook = env.SLACK_SYNC_ALERT_WEBHOOK_URL;
  if (webhook) {
    const safeUrl = slackWebhookUrl(webhook);
    if (safeUrl) {
      tasks.push(fetcher(safeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000)
      }).then((response) => {
        if (!response.ok) throw new Error("Slack alert delivery failed.");
      }));
    }
  }

  const recipients = emailAddresses(env.SYNC_ALERT_EMAIL_TO);
  if (env.RESEND_API_KEY && env.SYNC_ALERT_EMAIL_FROM && recipients.length > 0) {
    tasks.push(fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.SYNC_ALERT_EMAIL_FROM,
        to: recipients,
        subject: alert.status === "RECOVERED" ? "FinSight cloud sync recovered" : "FinSight cloud sync alert",
        text
      }),
      signal: AbortSignal.timeout(10_000)
    }).then((response) => {
      if (!response.ok) throw new Error("Email alert delivery failed.");
    }));
  }

  const results = await Promise.allSettled(tasks);
  return { attempted: tasks.length, delivered: results.filter((result) => result.status === "fulfilled").length };
}


export type BudgetThresholdAlert = {
  budgetName: string;
  currency: string;
  budgetAmount: number;
  spent: number;
  utilizationPercent: number;
  thresholdPercent: number;
  startsAt: string;
  endsAt: string;
};

/** Best-effort budget alert delivery using the existing worker Slack/Resend configuration. */
export async function deliverBudgetThresholdAlert(
  alert: BudgetThresholdAlert,
  fetcher: Fetcher = fetch,
  env: AlertEnvironment = process.env,
  skipChannels: string[] = []
): Promise<{ attempted: number; delivered: number; channelResults: Record<string, "DELIVERED" | "FAILED" | "SKIPPED"> }> {
  const message = [
    "FinSight budget threshold reached",
    `Budget: ${alert.budgetName}`,
    `Spend: ${alert.spent.toFixed(2)} ${alert.currency} / ${alert.budgetAmount.toFixed(2)} ${alert.currency}`,
    `Utilization: ${alert.utilizationPercent.toFixed(1)}% (threshold ${alert.thresholdPercent}%)`,
    `Budget window: ${alert.startsAt} to ${alert.endsAt}`
  ].join("\\n");
  const tasks: Array<{ channel: string; task: Promise<unknown> }> = [];
  const channelResults: Record<string, "DELIVERED" | "FAILED" | "SKIPPED"> = {};
  const webhook = env.SLACK_SYNC_ALERT_WEBHOOK_URL;
  if (skipChannels.includes("SLACK")) channelResults.SLACK = "SKIPPED";
  else if (webhook) {
    const safeUrl = slackWebhookUrl(webhook);
    if (safeUrl) tasks.push({ channel: "SLACK", task: fetcher(safeUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(10_000)
    }).then((response) => { if (!response.ok) throw new Error("Slack budget alert delivery failed."); }) });
  }
  const recipients = emailAddresses(env.SYNC_ALERT_EMAIL_TO);
  const emailConfigured = Boolean(env.RESEND_API_KEY && env.SYNC_ALERT_EMAIL_FROM && recipients.length > 0);
  if (skipChannels.includes("EMAIL")) channelResults.EMAIL = "SKIPPED";
  else if (emailConfigured) tasks.push({ channel: "EMAIL", task: fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.SYNC_ALERT_EMAIL_FROM, to: recipients,
      subject: `FinSight budget alert: ${alert.budgetName} at ${alert.thresholdPercent}%`,
      text: message
    }), signal: AbortSignal.timeout(10_000)
  }).then((response) => { if (!response.ok) throw new Error("Email budget alert delivery failed."); }) });
  const results = await Promise.all(tasks.map(async ({ channel, task }) => {
    try { await task; channelResults[channel] = "DELIVERED"; return true; }
    catch { channelResults[channel] = "FAILED"; return false; }
  }));
  return { attempted: tasks.length, delivered: results.filter(Boolean).length, channelResults };
}
