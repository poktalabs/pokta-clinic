import { z } from "zod";

// The clinic network that owns the Locations. Read-only: clients resolve it once.
export const Organization = z.object({
  resourceType: z.literal("Organization"),
  id: z.string().optional(),
  active: z.boolean().optional(),
  name: z.string(),
  // The razon social travels as an alias: it is a legal name, not a second Organization.
  alias: z.array(z.string()).optional(),
});
export type Organization = z.infer<typeof Organization>;

export function organizationResource(input: { id: string; nombre: string; razonSocial: string }): Organization {
  return { resourceType: "Organization", id: input.id, active: true, name: input.nombre, alias: [input.razonSocial] };
}
