import { EhrRejectedError, EhrUnavailableError, ehr } from "@/ehr";
import { BRANCHES, type BranchCode } from "@/scheduling/branches";

export type BranchDetails = { name: string; address: string; practitionerName: string };

// What the agent says about a branch. The EHR Location and Practitioner win (cached per server instance);
// availability and booking depend only on the calendar, so when the EHR is down or does not know the
// branch the config fallback answers instead of failing the call.
export async function branchDetails(code: BranchCode): Promise<BranchDetails> {
  try {
    const { name, address, practitionerName } = await ehr.getBranch(code);
    return { name, address, practitionerName };
  } catch (err) {
    if (!(err instanceof EhrUnavailableError) && !(err instanceof EhrRejectedError)) throw err;
    const { name, address, practitionerName } = BRANCHES[code];
    return { name, address, practitionerName };
  }
}
