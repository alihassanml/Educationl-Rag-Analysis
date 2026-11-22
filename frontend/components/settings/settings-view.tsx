"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StartDiagnosticButton } from "@/components/diagnostic/start-diagnostic-button";
import { authApi, diagnosticApi } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/formatters";
import type { ReactNode } from "react";

/** Only what the backend returns for the account today: the email and when it was created. */
export function SettingsView() {
  const user = useUser();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const diagnostic = useApi(diagnosticApi.status);
  const [lighter, setLighter] = useState(user.lighter_steps_enabled ?? true);
  const [lighterError, setLighterError] = useState<string | null>(null);
  const [peerMatch, setPeerMatch] = useState(user.peer_match_opt_in ?? false);
  const [peerMatchError, setPeerMatchError] = useState<string | null>(null);
  const [reminders, setReminders] = useState(user.reminders_enabled ?? true);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  async function toggleLighter(next: boolean) {
    setLighter(next);
    setLighterError(null);
    try {
      await authApi.setPreferences({ lighter_steps_enabled: next });
    } catch {
      setLighter(!next);
      setLighterError("Could not save this setting. Please try again.");
    }
  }

  async function togglePeerMatch(next: boolean) {
    setPeerMatch(next);
    setPeerMatchError(null);
    try {
      await authApi.setPreferences({ peer_match_opt_in: next });
    } catch {
      setPeerMatch(!next);
      setPeerMatchError("Could not save this setting. Please try again.");
    }
  }

  async function toggleReminders(next: boolean) {
    setReminders(next);
    setRemindersError(null);
    try {
      await authApi.setPreferences({ reminders_enabled: next });
    } catch {
      setReminders(!next);
      setRemindersError("Could not save this setting. Please try again.");
    }
  }

  // Stored in UTC, shown in the student's own time zone
  const offsetHours = Math.round(new Date().getTimezoneOffset() / 60);
  const [hourLocal, setHourLocal] = useState(((user.reminder_hour_utc ?? 9) - offsetHours + 24) % 24);

  async function changeReminderHour(local: number) {
    const previous = hourLocal;
    setHourLocal(local);
    setRemindersError(null);
    try {
      await authApi.setPreferences({ reminder_hour_utc: (local + offsetHours + 24) % 24 });
    } catch {
      setHourLocal(previous);
      setRemindersError("Could not save this setting. Please try again.");
    }
  }

  async function signOut() {
    setPending(true);
    try {
      await authApi.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>section]:h-fit">
        <Panel title="Study">
          <div className="divide-y divide-stone">
            <Toggle label="Lighter steps when I'm struggling" checked={lighter} onChange={(v) => void toggleLighter(v)} error={lighterError} />
            <Toggle label="Peer match" checked={peerMatch} onChange={(v) => void togglePeerMatch(v)} error={peerMatchError} />
            <Toggle label="Study reminders" checked={reminders} onChange={(v) => void toggleReminders(v)} error={remindersError}>
              {reminders ? (
                <div className="flex items-center gap-3 pt-3">
                  <label htmlFor="reminder-hour" className="text-ink-2">
                    Remind me around
                  </label>
                  <select id="reminder-hour" value={hourLocal} onChange={(e) => void changeReminderHour(Number(e.target.value))} className="h-10 rounded-control border border-stone-strong bg-paper px-3 text-ink">
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </Toggle>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          {diagnostic.data?.available ? (
            <Panel title="Starting test">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-ink-2">{diagnostic.data.taken_at ? `Taken ${formatDate(diagnostic.data.taken_at)}` : "Not taken yet"}</p>
                <StartDiagnosticButton label={diagnostic.data.taken ? "Retake the diagnostic" : "Start your diagnostic"} variant="secondary" />
              </div>
            </Panel>
          ) : null}
          <Panel title="Account">
            <dl className="divide-y divide-stone">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <dt className="text-ink-2">Email</dt>
                <dd className="break-all font-medium text-ink">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                <dt className="text-ink-2">Member since</dt>
                <dd className="font-medium text-ink">{formatDate(user.created_at)}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-stone pt-4">
              <Button variant="secondary" onClick={signOut} loading={pending}>
                Sign out
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}

/** One preference: its name and a checkbox. The name is the whole explanation. */
function Toggle({ label, checked, onChange, error, children }: { label: string; checked: boolean; onChange: (value: boolean) => void; error?: string | null; children?: ReactNode }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="font-medium text-ink">{label}</span>
        <input type="checkbox" className="size-5 accent-clay-strong" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
