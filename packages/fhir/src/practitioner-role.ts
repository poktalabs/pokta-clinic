import { z } from "zod";
import { ref, reference } from "./reference.ts";

// A Practitioner at one Location. A Practitioner may hold several; an Appointment needs one at its Location.
export const PractitionerRole = z.object({
  resourceType: z.literal("PractitionerRole"),
  id: z.string().optional(),
  active: z.boolean().optional(),
  practitioner: reference("Practitioner"),
  organization: reference("Organization"),
  location: z.array(reference("Location")).min(1),
  specialty: z.array(z.object({ text: z.string() })).optional(),
});
export type PractitionerRole = z.infer<typeof PractitionerRole>;

// Read-only.
export function practitionerRoleResource(input: {
  id: string;
  practitionerId: string;
  locationId: string;
  organizationId: string;
  especialidad: string;
}): PractitionerRole {
  return {
    resourceType: "PractitionerRole",
    id: input.id,
    active: true,
    practitioner: ref("Practitioner", input.practitionerId),
    organization: ref("Organization", input.organizationId),
    location: [ref("Location", input.locationId)],
    specialty: [{ text: input.especialidad }],
  };
}
