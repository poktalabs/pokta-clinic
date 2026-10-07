import { z } from "zod";
import { CALENDAR_EVENT_SYSTEM } from "./appointment.ts";
import { CONVERSATION_SYSTEM } from "./consent.ts";
import { Identifier } from "./patient.ts";
import { ref, reference } from "./reference.ts";

// A callback request: the caller did not book and the branch's front desk must call them back. One
// per Conversation. The note holds when the caller can take the call; the owner is the branch.
export const CALLBACK_TASK_SYSTEM = "urn:pokta-clinic:task";
export const CALLBACK_TASK_CODE = "callback";
export const CALLBACK_TASK_TEXT = "Devolver llamada";
export const TASK_STATUS = ["requested", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const Task = z.object({
  resourceType: z.literal("Task"),
  id: z.string().optional(),
  identifier: z.array(Identifier).min(1),
  status: z.enum(TASK_STATUS),
  intent: z.literal("order"),
  priority: z.literal("routine").optional(),
  code: z.object({
    coding: z.array(z.object({ system: z.string(), code: z.string() })).min(1),
    text: z.string().optional(),
  }),
  // Optional: the caller may ask for a callback before they are identified.
  for: reference("Patient").optional(),
  owner: reference("Location").optional(),
  authoredOn: z.iso.datetime({ offset: true }).optional(),
  description: z.string().optional(),
  note: z.array(z.object({ text: z.string() })).min(1),
  reasonCode: z.object({ text: z.string() }),
});
export type Task = z.infer<typeof Task>;

export const isCallbackTask = (task: Task) => task.code.coding.some((c) => c.system === CALLBACK_TASK_SYSTEM && c.code === CALLBACK_TASK_CODE);

export function taskResource(input: {
  id?: string;
  conversationId: string;
  patientId?: string | null;
  locationId?: string | null;
  status: TaskStatus;
  authoredOn: string;
  availability: string;
  reason: string;
  description?: string | null;
  calendarEventId?: string | null;
}): Task {
  const identifier = [{ system: CONVERSATION_SYSTEM, value: input.conversationId }];
  if (input.calendarEventId) identifier.push({ system: CALENDAR_EVENT_SYSTEM, value: input.calendarEventId });
  return {
    resourceType: "Task",
    id: input.id,
    identifier,
    status: input.status,
    intent: "order",
    priority: "routine",
    code: { coding: [{ system: CALLBACK_TASK_SYSTEM, code: CALLBACK_TASK_CODE }], text: CALLBACK_TASK_TEXT },
    for: input.patientId ? ref("Patient", input.patientId) : undefined,
    owner: input.locationId ? ref("Location", input.locationId) : undefined,
    authoredOn: input.authoredOn,
    description: input.description ?? undefined,
    note: [{ text: input.availability }],
    reasonCode: { text: input.reason },
  };
}
