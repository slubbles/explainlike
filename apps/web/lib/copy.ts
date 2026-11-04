/**
 * The /copy page: the sign-in email links here with the code in ?c, for mail clients
 * where selecting the code is awkward. The code is validated here, on the server,
 * before anything renders it; anything else shows the invalid-link message.
 */

/** A login code is exactly 6 digits; repeated ?c= params and anything else fail. */
export function isValidCopyCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}
