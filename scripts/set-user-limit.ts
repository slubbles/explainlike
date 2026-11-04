/**
 * Give one account its own daily video limit: pnpm set-user-limit <email> <n>
 * (needs the D1 settings in the environment; the account signs in once first).
 */
import { getD1Db } from "../apps/web/lib/db";
import { setUserLimitByEmail } from "../apps/web/lib/usage";

const [email, raw] = process.argv.slice(2);
if (!email || !raw) {
  console.error("Give one account its own daily video limit.\n\nUsage: pnpm set-user-limit <email> <n>");
  process.exit(2);
}
try {
  const r = await setUserLimitByEmail(email, Number(raw), getD1Db());
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`${email} can now make ${r.limit} videos a day.`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
