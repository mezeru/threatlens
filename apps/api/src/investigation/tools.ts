import { z } from "zod";
import {
  syntheticEvents,
  type SyntheticSecurityEvent
} from "./dataset.js";

const userIdSchema = z.string().trim().min(1).max(128);
const sourceIpSchema = z.union([z.ipv4(), z.ipv6()]);

export const authSearchInputSchema = z
  .object({
    userId: userIdSchema.optional(),
    sourceIp: sourceIpSchema.optional()
  })
  .strict()
  .refine((input) => Boolean(input.userId || input.sourceIp), {
    message: "Provide a userId or sourceIp."
  });

export const userQueryInputSchema = z.object({ userId: userIdSchema }).strict();

function chronological(
  events: SyntheticSecurityEvent[]
): SyntheticSecurityEvent[] {
  return [...events].sort(
    (left, right) =>
      Date.parse(left.timestamp) - Date.parse(right.timestamp)
  );
}

export function searchAuthEvents(input: unknown): SyntheticSecurityEvent[] {
  const query = authSearchInputSchema.parse(input);
  return chronological(
    syntheticEvents.filter(
      (event) =>
        event.eventType.startsWith("auth.") &&
        (!query.userId || event.userId === query.userId) &&
        (!query.sourceIp || event.sourceIp === query.sourceIp)
    )
  );
}

export function getUserTimeline(input: unknown): SyntheticSecurityEvent[] {
  const { userId } = userQueryInputSchema.parse(input);
  return chronological(syntheticEvents.filter((event) => event.userId === userId));
}

export function getResourceAccessEvents(
  input: unknown
): SyntheticSecurityEvent[] {
  const { userId } = userQueryInputSchema.parse(input);
  return chronological(
    syntheticEvents.filter(
      (event) =>
        event.userId === userId &&
        event.eventType === "resource.sensitive_access"
    )
  );
}
