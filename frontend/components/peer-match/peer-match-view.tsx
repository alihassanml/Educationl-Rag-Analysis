"use client";

import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { authApi, peerMatchApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { Difficulty, PeerMatchCandidate } from "@/types/api";

export function PeerMatchView() {
  const [blockTarget, setBlockTarget] = useState<PeerMatchCandidate | null>(null);
  const [blocking, setBlocking] = useState(false);
  const user = useUser();
  const [optedIn, setOptedIn] = useState(user.peer_match_opt_in ?? false);
  const matches = useApi(peerMatchApi.matches);
  const challenges = useApi(peerMatchApi.challenges);

  // Challenge modal state
  const [selectedPeer, setSelectedPeer] = useState<PeerMatchCandidate | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("intermediate");
  const [challenging, setChallenging] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const allChallenges = challenges.data ?? [];

  function reloadAll() {
    matches.reload();
    challenges.reload();
  }

  async function handleToggleOptIn() {
    try {
      const next = !optedIn;
      await authApi.setPreferences({ peer_match_opt_in: next });
      setOptedIn(next);
      reloadAll();
    } catch {
      setActionMessage("Could not update opt-in preference.");
    }
  }

  async function handleSendChallenge() {
    if (!selectedPeer) return;
    try {
      setChallenging(true);
      await peerMatchApi.createChallenge(
        selectedPeer.user_id,
        selectedPeer.topic_name,
        selectedDifficulty
      );
      setSelectedPeer(null);
      setActionMessage(`Challenge sent to ${selectedPeer.display_name}!`);
      reloadAll();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to send challenge");
    } finally {
      setChallenging(false);
    }
  }

  async function handleBlock() {
    if (!blockTarget) return;
    setBlocking(true);
    try {
      await peerMatchApi.block(blockTarget.user_id, "reported");
      setActionMessage(`${blockTarget.display_name} was reported and blocked. You will not be matched again.`);
      setBlockTarget(null);
      reloadAll();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Could not block this student");
    } finally {
      setBlocking(false);
    }
  }

  async function handleAccept(id: string) {
    try {
      await peerMatchApi.accept(id);
      reloadAll();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to accept challenge");
    }
  }

  async function handleDecline(id: string) {
    try {
      await peerMatchApi.decline(id);
      reloadAll();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to decline challenge");
    }
  }

  async function handleCancel(id: string) {
    try {
      await peerMatchApi.cancel(id);
      reloadAll();
    } catch (err: unknown) {
      setActionMessage(err instanceof Error ? err.message : "Failed to cancel challenge");
    }
  }

  const active = allChallenges.filter((c) => c.status === "pending" || c.status === "accepted");
  const past = allChallenges.filter((c) => c.status === "completed");
  const peers = matches.data ?? [];
  const ready = !matches.loading && !challenges.loading;

  return (
    <PageContainer>
      <PageHeader
        title="Peer match"
        action={
          <Button variant={optedIn ? "secondary" : "primary"} onClick={handleToggleOptIn}>
            {optedIn ? "Turn off" : "Turn on"}
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {actionMessage ? (
          <div role="status" className="flex items-center justify-between gap-4 rounded-panel bg-stone-100 px-4 py-3 text-ink">
            <span>{actionMessage}</span>
            <button type="button" onClick={() => setActionMessage(null)} className="font-medium text-accent-link hover:underline">
              Dismiss
            </button>
          </div>
        ) : null}

        {matches.loading || challenges.loading ? <LoadingBlock label="Loading" /> : null}
        {matches.error ? <ErrorBlock message={matches.error.message} onRetry={reloadAll} /> : null}

        {ready ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Matched peers">
                {peers.length === 0 ? (
                  <p className="py-4 text-ink-2">{optedIn ? "No matches yet." : "Turn on Peer match to see students."}</p>
                ) : (
                  <ul className="divide-y divide-stone">
                    {peers.map((peer) => (
                      <li key={`${peer.user_id}-${peer.topic_name}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {peer.display_name}
                            {peer.in_same_class ? <span className="ml-2 font-normal text-ink-2">Classmate</span> : null}
                          </p>
                          <p className="truncate text-ink-2">{peer.topic_name}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedPeer(peer);
                              setSelectedDifficulty("intermediate");
                            }}
                          >
                            Challenge
                          </Button>
                          <Button size="sm" variant="secondary" aria-label={`Report and block ${peer.display_name}`} onClick={() => setBlockTarget(peer)}>
                            Block
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Active duels">
                {active.length === 0 ? (
                  <p className="py-4 text-ink-2">No active duels.</p>
                ) : (
                  <ul className="divide-y divide-stone">
                    {active.map((c) => {
                      const isChallenger = c.my_role === "challenger";
                      const otherName = isChallenger ? c.opponent_name : c.challenger_name;
                      return (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{c.topic_name}</p>
                            <p className="truncate text-ink-2">
                              {c.status === "pending"
                                ? isChallenger
                                  ? `Waiting for ${otherName}`
                                  : `${otherName} challenged you`
                                : `Against ${otherName}`}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {c.status === "pending" && !isChallenger ? (
                              <>
                                <Button size="sm" onClick={() => handleAccept(c.id)}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => handleDecline(c.id)}>
                                  Decline
                                </Button>
                              </>
                            ) : null}
                            {c.status === "pending" && isChallenger ? (
                              <Button size="sm" variant="secondary" onClick={() => handleCancel(c.id)}>
                                Cancel
                              </Button>
                            ) : null}
                            {c.status === "accepted" ? (
                              !c.my_completed && c.my_quiz_id ? (
                                <ButtonLink size="sm" href={`/quizzes/${c.my_quiz_id}?duel=${c.id}`}>
                                  Take quiz
                                </ButtonLink>
                              ) : (
                                <span className="text-ink-2">Waiting for {otherName}</span>
                              )
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Past duels">
              {past.length === 0 ? (
                <p className="py-4 text-ink-2">No duels yet.</p>
              ) : (
                <ul className="divide-y divide-stone">
                  {past.map((c) => {
                    const iWon = c.winner_name === (c.my_role === "challenger" ? c.challenger_name : c.opponent_name);
                    const isTie = !c.winner_id;
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{c.topic_name}</p>
                          <p className="truncate text-ink-2">
                            {c.challenger_name} {c.challenger_score}/{c.challenger_total} · {c.opponent_name} {c.opponent_score}/{c.opponent_total}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Chip tone={isTie ? "neutral" : iWon ? "success" : "neutral"}>{isTie ? "Tie" : iWon ? "Won" : "Lost"}</Chip>
                          <span className="text-ink-2">{formatRelative(c.completed_at || c.created_at)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </>
        ) : null}
      </div>

      {selectedPeer ? (
        <Dialog open onClose={() => setSelectedPeer(null)} title={`Challenge ${selectedPeer.display_name}`}>
          <div className="space-y-4 py-2">
            <p className="text-ink">
              Quiz duel on <strong className="font-semibold">{selectedPeer.topic_name}</strong>
            </p>
            <div className="flex gap-2" role="group" aria-label="Difficulty">
              {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-pressed={selectedDifficulty === lvl}
                  onClick={() => setSelectedDifficulty(lvl)}
                  className={cn(
                    "h-9 rounded-control border px-4 text-sm font-medium capitalize transition-colors",
                    selectedDifficulty === lvl ? "border-ink bg-ink text-paper" : "border-stone bg-paper text-ink hover:bg-stone-100",
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedPeer(null)}>
              Cancel
            </Button>
            <Button onClick={handleSendChallenge} loading={challenging}>
              Send challenge
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={blockTarget !== null}
        title={`Report and block ${blockTarget?.display_name ?? ""}?`}
        description="They will no longer be matched with you, and neither of you can send the other challenges."
        confirmLabel="Report and block"
        pending={blocking}
        onConfirm={() => void handleBlock()}
        onCancel={() => setBlockTarget(null)}
      />
    </PageContainer>
  );
}
