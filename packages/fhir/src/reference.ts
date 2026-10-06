import { z } from "zod";

// A literal reference to a resource this server holds, e.g. "Patient/<id>".
export const reference = (type: string) => z.object({ reference: z.string().regex(new RegExp(`^${type}/.+`)) });
export const ref = (type: string, id: string) => ({ reference: `${type}/${id}` });

export const TextExtension = z.object({ url: z.string(), valueString: z.string() });
