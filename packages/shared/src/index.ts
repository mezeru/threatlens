export type SecurityEventSeverity = "low" | "medium" | "high" | "critical";

export interface SecurityEvent {
  id: string;
  timestamp: string;
  source: string;
  eventType: string;
  severity: SecurityEventSeverity;
  description: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface InvestigationFinding {
  title: string;
  severity: SecurityEventSeverity;
  description: string;
  evidenceEventIds: string[];
}

export interface InvestigationResult {
  summary: string;
  findings: InvestigationFinding[];
  recommendedActions: string[];
}
