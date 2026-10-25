import type { SecurityEvent } from "@threatlens/shared";

export const SYNTHETIC_DATASET_LABEL = "SYNTHETIC SECURITY EVENTS";

export interface SyntheticSecurityEvent extends SecurityEvent {
  userId: string;
  sourceIp: string;
  resourceId?: string;
}

export const syntheticEvents: SyntheticSecurityEvent[] = [
  {
    id: "EVT-1001",
    timestamp: "2026-10-24T08:12:00.000Z",
    source: "identity-provider",
    eventType: "auth.failed_login",
    severity: "medium",
    description: "Failed password login",
    userId: "usr-alex",
    sourceIp: "198.51.100.24"
  },
  {
    id: "EVT-1002",
    timestamp: "2026-10-24T08:13:12.000Z",
    source: "identity-provider",
    eventType: "auth.failed_login",
    severity: "medium",
    description: "Failed password login",
    userId: "usr-alex",
    sourceIp: "198.51.100.24"
  },
  {
    id: "EVT-1003",
    timestamp: "2026-10-24T08:14:30.000Z",
    source: "identity-provider",
    eventType: "auth.failed_login",
    severity: "high",
    description: "Failed password login",
    userId: "usr-alex",
    sourceIp: "198.51.100.24"
  },
  {
    id: "EVT-1004",
    timestamp: "2026-10-24T08:16:02.000Z",
    source: "identity-provider",
    eventType: "auth.successful_login",
    severity: "low",
    description: "Successful password login after repeated failures",
    userId: "usr-alex",
    sourceIp: "198.51.100.24"
  },
  {
    id: "EVT-1005",
    timestamp: "2026-10-24T08:19:41.000Z",
    source: "document-service",
    eventType: "resource.sensitive_access",
    severity: "high",
    description: "Sensitive payroll report accessed",
    userId: "usr-alex",
    sourceIp: "198.51.100.24",
    resourceId: "payroll-report"
  },
  {
    id: "EVT-1006",
    timestamp: "2026-10-24T09:02:00.000Z",
    source: "identity-provider",
    eventType: "auth.successful_login",
    severity: "low",
    description: "Successful password login",
    userId: "usr-jordan",
    sourceIp: "203.0.113.17"
  }
];
