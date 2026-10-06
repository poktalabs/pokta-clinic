// Mexican numbers are 10 digits; callers often add +52, spaces or dashes.
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export const INVALID_PHONE = {
  invalid_phone: true,
  message: "The phone number does not have 10 digits. Ask the patient to say it again, digit by digit.",
};
