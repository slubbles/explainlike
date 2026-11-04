import { requireAppUser } from "../../../lib/appuser";
import { getD1Db } from "../../../lib/db";
import { listJobs } from "../../../lib/jobs";
import { ensureUsageTables } from "../../../lib/usage";
import { listVideosForUser } from "../../../lib/videos";
import { DeleteAccountButton, SignOutButton } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Explanimate" };

/** The account: its address, sign out, and the way out entirely. */
export default async function SettingsPage() {
  const user = await requireAppUser();
  const db = getD1Db();
  await ensureUsageTables(db);
  const videos = await listVideosForUser(user.id, listJobs(), db);

  return (
    <>
      <h1 className="app-h1">Settings</h1>

      <div className="app-grid">
        <div className="app-c">
          <div className="app-chead">
            <span>Account</span>
          </div>
          <div className="app-rows">
            <div className="app-row">
              <span className="k">Email</span>
              <span className="v">{user.email}</span>
            </div>
            <div className="app-row">
              <span className="k">Session</span>
              <span className="v">Signed in. Sessions last 7 days.</span>
              <span className="a">
                <SignOutButton />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="app-grid danger">
        <div className="app-c">
          <div className="app-chead">
            <span>Delete account</span>
          </div>
          <p className="app-note" style={{ marginBottom: 14 }}>
            Removes your account, every video you made, and your usage history. This cannot be undone.
          </p>
          <DeleteAccountButton videos={videos.length} />
        </div>
      </div>
    </>
  );
}
