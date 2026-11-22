"use client";

import { LogOut } from "lucide-react";
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
      <PageHeader title="Settings" description="Your account details" />
      <div className="flex max-w-2xl flex-col gap-6">
        {diagnostic.data?.available ? (
          <Panel title="Starting test">
            <p className="text-sm text-ink">
              The diagnostic sets the level each topic starts at.
              {diagnostic.data.taken_at ? ` You last took it on ${formatDate(diagnostic.data.taken_at)}.` : " You have not taken it yet."} Retaking it resets your topic levels to the new result.
            </p>
            <div className="mt-4">
              <StartDiagnosticButton label={diagnostic.data.taken ? "Retake the diagnostic" : "Start your diagnostic"} variant="secondary" />
            </div>
          </Panel>
        ) : null}
        <Panel title="Study pace">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 accent-clay-strong" checked={lighter} onChange={(e) => void toggleLighter(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-ink">Lighter steps when I&apos;m struggling</span>
              <span className="block text-small text-ink-2">After three wrong answers in a row, two low quiz scores in a row, or repeated difficulty at beginner level, you get a short recap and an easy quiz before moving on.</span>
            </span>
          </label>
          {lighterError ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {lighterError}
            </p>
          ) : null}
        </Panel>
        <Panel title="Peer match">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 accent-clay-strong" checked={peerMatch} onChange={(e) => void togglePeerMatch(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-ink">Match me with students sharing weak topics</span>
              <span className="block text-small text-ink-2">Opt in to find classmates and other students who need revision on the same concepts, and challenge them to practice duels. Only your display name is visible.</span>
            </span>
          </label>
          {peerMatchError ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {peerMatchError}
            </p>
          ) : null}
        </Panel>
        <Panel title="Study reminders">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 accent-clay-strong" checked={reminders} onChange={(e) => void toggleReminders(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium text-ink">Spaced repetition reminders</span>
              <span className="block text-small text-ink-2">Get gentle daily reminders when topics are due for review so you can maintain consistency with quick 2-minute slip tests.</span>
            </span>
          </label>
          {reminders ? (
            <div className="mt-4 flex items-center gap-3 pl-7 text-sm">
              <label htmlFor="reminder-hour" className="text-ink-2">
                Remind me around
              </label>
              <select
                id="reminder-hour"
                value={hourLocal}
                onChange={(e) => void changeReminderHour(Number(e.target.value))}
                className="h-9 rounded-control border border-stone-strong bg-paper px-2 text-ink"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {remindersError ? (
            <p role="alert" className="mt-2 text-small text-danger">
              {remindersError}
            </p>
          ) : null}
        </Panel>
        <Panel title="Account">
          <dl className="divide-y divide-stone text-sm">
            <div className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:gap-6">
              <dt className="w-40 shrink-0 text-ink-2">Email</dt>
              <dd className="break-all font-medium text-ink">{user.email}</dd>
            </div>
            <div className="flex flex-col gap-1 py-3 last:pb-0 sm:flex-row sm:gap-6">
              <dt className="w-40 shrink-0 text-ink-2">Member since</dt>
              <dd className="font-medium text-ink">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-stone pt-4">
            <Button variant="secondary" onClick={signOut} loading={pending}>
              {pending ? null : <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />}
              Sign out
            </Button>
          </div>
        </Panel>
      </div>
    </PageContainer>
  );
}
