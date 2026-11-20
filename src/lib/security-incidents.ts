export type SecurityIncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityIncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";

export type CorrelatableSecurityEvent = {
  id: string;
  routeBucket: string;
  requestCount: number;
  requestLimit: number;
  createdAt: Date;
};

export function classifySecurityIncident(
  event: CorrelatableSecurityEvent,
  correlatedEventsInHour: number
): SecurityIncidentSeverity {
  const ratio = event.requestLimit > 0 ? event.requestCount / event.requestLimit : 0;
  if (ratio >= 3 || correlatedEventsInHour >= 5) return "CRITICAL";
  if (ratio >= 2 || correlatedEventsInHour >= 3) return "HIGH";
  if (ratio >= 1.5 || correlatedEventsInHour >= 2) return "MEDIUM";
  return "LOW";
}

export function buildIncidentFromEvent(
  event: CorrelatableSecurityEvent,
  correlatedEventsInHour: number
) {
  const severity = classifySecurityIncident(event, correlatedEventsInHour);
  const route = event.routeBucket.replaceAll(":", " · ").replaceAll("_", " ");
  return {
    title: `Rate-limit abuse signal: ${route}`.slice(0, 180),
    description: `A protected API route crossed its configured request limit. Recorded count: ${event.requestCount}; configured limit: ${event.requestLimit}. ${correlatedEventsInHour} threshold-crossing event(s) for this route were observed in the preceding rolling hour. This is a triage signal, not proof of malicious activity or account compromise.`.slice(0, 2000),
    severity
  };
}

export function transitionIncidentStatus(
  current: SecurityIncidentStatus,
  next: SecurityIncidentStatus
): { status: SecurityIncidentStatus; acknowledged: boolean; resolved: boolean } | null {
  const allowed: Record<SecurityIncidentStatus, SecurityIncidentStatus[]> = {
    OPEN: ["ACKNOWLEDGED", "FALSE_POSITIVE"],
    ACKNOWLEDGED: ["OPEN", "RESOLVED", "FALSE_POSITIVE"],
    RESOLVED: ["OPEN"],
    FALSE_POSITIVE: ["OPEN"]
  };
  if (!allowed[current].includes(next)) return null;
  return {
    status: next,
    acknowledged: next === "ACKNOWLEDGED",
    resolved: next === "RESOLVED" || next === "FALSE_POSITIVE"
  };
}
