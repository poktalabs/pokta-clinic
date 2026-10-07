import type { ToolProperty } from "../types.ts";

// The email the caller typed on the explainer page, passed at session start as the `caller_email`
// dynamic variable. The platform fills it in; the LLM never sees or supplies it. Empty for widget calls.
export const callerEmail: ToolProperty = { type: "string", dynamic_variable: "caller_email" };
