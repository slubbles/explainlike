"use client";
import { useEffect, useRef, useState } from "react";
import type { AdminLive } from "../../lib/admin";
import { formatMs } from "../../lib/metrics";

const POLL_MS = 5000;

const when = (iso: string) => (iso.length > 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso);
const money = (n: number) => `$${n.toFixed(3)}`;
const pct = (r: number | null) => (r === null ? "n/a" : `${Math.round(r * 100)}%`);

/**
 * The live half of the admin dashboard: queue, spend, render stats, usage, signups and failures,
 * repainted from /api/admin/live every 5 s. The server renders the first snapshot, so the page
 * reads before the first poll; a lost admin session stops the polling with a note instead of 404s.
 * Skips polls while the tab is hidden and refetches when it comes back.
 */
export default function Live({ initial }: { initial: AdminLive }) {
  const [live, setLive] = useState(initial);
  const [health, setHealth] = useState<"live" | "stale" | "gone">("live");
  const fails = useRef(0);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (stop || document.hidden) return;
      const r = await fetch("/api/admin/live", { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (!r || !r.ok) {
        if (r?.status === 404) {
          stop = true;
          setHealth("gone");
          return;
        }
        fails.current += 1;
      } else {
        const next = (await r.json().catch(() => null)) as AdminLive | null;
        if (next && typeof next.now === "number") {
          fails.current = 0;
          setLive(next);
        } else fails.current += 1;
      }
      setHealth(fails.current >= 3 ? "stale" : "live");
    };
    const t = setInterval(poll, POLL_MS);
    const wake = () => void poll();
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  const m = live.metrics;
  const m24 = live.metrics24h;
  const maxDay = Math.max(1, ...live.videosPerDay.map((d) => d.videos));
  const updated = `${new Date(live.now).toISOString().slice(11, 19)} UTC`;

  return (
    <>
      <p className={`livebar ${health}`} role={health === "live" ? undefined : "status"}>
        <span className="dot" aria-hidden="true" />
        {health === "gone"
          ? "Signed out or no longer an admin: showing the last snapshot. Sign back in and reload."
          : health === "stale"
            ? `The server stopped answering: showing data from ${updated}.`
            : `Live: refreshes every 5 s · updated ${updated}`}
      </p>

      <section aria-label="Live queue">
        <h2>Live queue</h2>
        <div className="stats">
          <div>
            <span>Running / waiting now</span>
            <b>
              {live.running} / {live.queued}
            </b>
          </div>
        </div>
        {live.active.length === 0 ? (
          <p className="muted">Nothing running or waiting.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Status</th>
                  <th scope="col">Queue</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {live.active.map((j) => (
                  <tr key={j.id}>
                    <td className="nowrap">
                      <a href={`/?job=${j.id}`}>{j.id}</a>
                      <div className="muted sub">
                        {j.kind} · {when(new Date(j.started).toISOString())}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${j.state}`}>{j.state}</span>
                      <div className="muted small prompt">
                        {j.state === "queued" ? "waiting for a slot" : `${j.stage}: ${j.message} · ${j.pct}%`}
                      </div>
                    </td>
                    <td className="nowrap">{j.queuePosition === null ? "n/a" : `#${j.queuePosition}`}</td>
                    <td className="nowrap">{money(j.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Spend">
        <h2>Spend</h2>
        <div className="stats">
          <div>
            <span>Today (UTC)</span>
            <b>
              {money(live.spend.today)} of {money(live.spend.dailyCap)}
            </b>
            {!live.spend.dailyOk && <em>paused until 00:00 UTC</em>}
          </div>
          <div>
            <span>Lifetime Meta (Muse)</span>
            <b>
              {money(live.spend.lifetime.meta)} of {money(live.spend.caps.meta)}
            </b>
          </div>
          <div>
            <span>Lifetime Deepgram</span>
            <b>
              {money(live.spend.lifetime.voice)} of {money(live.spend.caps.voice)}
            </b>
          </div>
        </div>
        {live.spend.warnings.map((w) => (
          <p className="note" role="status" key={w}>
            {w}
          </p>
        ))}
      </section>

      <section aria-label="Renders">
        <h2>Renders</h2>
        <div className="stats">
          <div>
            <span>Last 24 h</span>
            <b>
              {m24.done} done · {m24.failed} failed{m24.cancelled ? ` · ${m24.cancelled} cancelled` : ""}
            </b>
            <em className="plain">success {pct(m24.successRate)}</em>
          </div>
          <div>
            <span>Render time (p50 · p95)</span>
            <b>
              {formatMs(m.medianRenderMs)} · {formatMs(m.p95RenderMs)}
            </b>
          </div>
          <div>
            <span>Wait for a slot (median)</span>
            <b>{formatMs(m.medianWaitMs)}</b>
          </div>
          <div>
            <span>Request to video (median)</span>
            <b>{formatMs(m.medianTotalMs)}</b>
          </div>
          <div>
            <span>Cost per video (avg)</span>
            <b>{m.avgCostDone === null ? "n/a" : money(m.avgCostDone)}</b>
          </div>
          <div>
            <span>Fallbacks (LLM · voice)</span>
            <b>
              {live.fallbacks.llm} · {live.fallbacks.tts}
            </b>
            <em className="plain">of {live.fallbacks.checked} finished videos</em>
          </div>
        </div>
        <p className="muted small">
          All {m.total} jobs on this server: {m.done} done, {m.failed} failed, {m.cancelled} cancelled, success {pct(m.successRate)}.
        </p>
      </section>

      <section aria-label="Videos per day">
        <h2>Videos per day</h2>
        {live.dbOff ? (
          <p className="muted">Unavailable: the sign-in database is not answering.</p>
        ) : live.videosPerDay.length === 0 ? (
          <p className="muted">No usage yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Day (UTC)</th>
                  <th scope="col">Videos</th>
                  <th scope="col">Accounts</th>
                </tr>
              </thead>
              <tbody>
                {live.videosPerDay.map((d) => (
                  <tr key={d.day}>
                    <td className="nowrap">{d.day}</td>
                    <td>
                      <span className="daybar">
                        <b>{d.videos}</b>
                        <span className="track" aria-hidden="true">
                          <span className="fill" style={{ width: `${Math.round((d.videos / maxDay) * 100)}%` }} />
                        </span>
                      </span>
                    </td>
                    <td>{d.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Recent signups">
        <h2>Recent signups</h2>
        {live.dbOff ? (
          <p className="muted">Unavailable: the sign-in database is not answering.</p>
        ) : live.signups.length === 0 ? (
          <p className="muted">No accounts yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {live.signups.map((u) => (
                  <tr key={u.email}>
                    <td>{u.email}</td>
                    <td className="nowrap">{when(u.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!live.dbOff && live.signups.length > 0 && (
          <p className="muted small">
            <a className="jump" href="#users">
              All accounts below
            </a>
          </p>
        )}
      </section>

      <section aria-label="Recent failures">
        <h2>Recent failures</h2>
        {live.failures.length === 0 ? (
          <p className="muted">No failures recorded.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Error</th>
                  <th scope="col">Input</th>
                </tr>
              </thead>
              <tbody>
                {live.failures.map((f) => (
                  <tr key={f.id}>
                    <td className="nowrap">
                      <a href={`/?job=${f.id}`}>{f.id}</a>
                      <div className="muted sub">
                        {f.kind} · {when(new Date(f.started).toISOString())}
                      </div>
                    </td>
                    <td className="prompt">{f.error}</td>
                    <td className="prompt">{f.input || "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
