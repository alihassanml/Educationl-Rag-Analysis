"use client";

import { Check, Clock, Swords, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useUser } from "@/components/auth/session-provider";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { ErrorBlock, LoadingBlock } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/panel";
import { authApi, peerMatchApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/relative-time";
import { useApi } from "@/lib/use-api";
import type { Difficulty, PeerMatchCandidate } from "@/types/api";

export function PeerMatchView() {
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

  return (
    <PageContainer>
      <PageHeader
        title="Peer match"
        description="Compete in quiz duels with students who share your weak topics"
      />

      <div className="flex flex-col gap-6">
        {/* Opt-in banner */}
        {!optedIn ? (
          <div className="rounded-panel border border-accent/20 bg-accent/5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Peer Match is currently turned off</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Opt in to see fellow students who need revision on the same concepts. Only your display name is shared.
                </p>
              </div>
              <Button onClick={handleToggleOptIn} variant="primary">
                Enable Peer Match
              </Button>
            </div>
          </div>
        ) : null}

        {actionMessage ? (
          <div className="flex items-center justify-between rounded-control border border-stone bg-paper px-4 py-3 text-sm text-ink">
            <span>{actionMessage}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-ink-2 hover:text-ink"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {matches.loading || challenges.loading ? <LoadingBlock label="Finding peer matches and duels..." /> : null}
        {matches.error ? <ErrorBlock message={matches.error.message} onRetry={reloadAll} /> : null}

        {!matches.loading && !challenges.loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left column: Matched Peers */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Panel
                title="Matched peers"
                description="Students who also need revision on your weak topics"
              >
                {(matches.data ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-2">
                    {optedIn
                      ? "No matched peers right now. As more students practice or take diagnostics, matches will appear here."
                      : "Enable Peer Match above to find students with shared weak topics."}
                  </div>
                ) : (
                  <div className="divide-y divide-stone">
                    {(matches.data ?? []).map((peer) => (
                      <div
                        key={`${peer.user_id}-${peer.topic_name}`}
                        className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 items-center justify-center rounded-full bg-clay text-sm font-semibold text-ink uppercase">
                            {peer.display_name.slice(0, 1)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink">{peer.display_name}</span>
                              {peer.in_same_class ? (
                                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                                  Classmate
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-ink-2">
                              Shared weak topic: <strong className="font-medium text-ink">{peer.topic_name}</strong>
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedPeer(peer);
                            setSelectedDifficulty("intermediate");
                          }}
                        >
                          <Swords size={14} className="mr-1.5" aria-hidden="true" />
                          Challenge
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Completed Duels History */}
              <Panel title="Past duels" description="Completed peer quiz battles">
                {allChallenges.filter((c) => c.status === "completed").length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-2">No completed duels yet.</p>
                ) : (
                  <div className="divide-y divide-stone">
                    {allChallenges
                      .filter((c) => c.status === "completed")
                      .map((c) => {
                        const iWon = c.winner_name === (c.my_role === "challenger" ? c.challenger_name : c.opponent_name);
                        const isTie = !c.winner_id;
                        return (
                          <div key={c.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-ink">
                                  Duel on {c.topic_name}
                                </span>
                                <Chip tone={isTie ? "neutral" : iWon ? "success" : "neutral"}>
                                  {isTie ? "Tie" : iWon ? "Won" : "Lost"}
                                </Chip>
                              </div>
                              <p className="mt-1 text-xs text-ink-2">
                                {c.challenger_name} ({c.challenger_score}/{c.challenger_total} · {c.challenger_time_seconds}s) vs{" "}
                                {c.opponent_name} ({c.opponent_score}/{c.opponent_total} · {c.opponent_time_seconds}s)
                              </p>
                            </div>
                            <span className="text-xs text-ink-3">
                              {formatRelative(c.completed_at || c.created_at)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Panel>
            </div>

            {/* Right column: Active Duels & Incoming Challenges */}
            <div className="flex flex-col gap-6">
              <Panel title="Active duels & challenges">
                {allChallenges.filter((c) => c.status === "pending" || c.status === "accepted").length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-2">No active challenges right now.</p>
                ) : (
                  <div className="space-y-4">
                    {allChallenges
                      .filter((c) => c.status === "pending" || c.status === "accepted")
                      .map((c) => {
                        const isChallenger = c.my_role === "challenger";
                        const otherName = isChallenger ? c.opponent_name : c.challenger_name;

                        if (c.status === "pending") {
                          return (
                            <div key={c.id} className="rounded-control border border-stone bg-paper p-3.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-ink">Topic: {c.topic_name}</span>
                                <span className="text-ink-3">{formatRelative(c.created_at)}</span>
                              </div>
                              <p className="mt-1.5 text-ink-2">
                                {isChallenger ? (
                                  <>Waiting for <strong>{otherName}</strong> to accept your challenge.</>
                                ) : (
                                  <><strong>{otherName}</strong> challenged you to a duel!</>
                                )}
                              </p>
                              <div className="mt-3 flex gap-2">
                                {!isChallenger ? (
                                  <>
                                    <Button size="sm" variant="primary" onClick={() => handleAccept(c.id)}>
                                      Accept
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleDecline(c.id)}>
                                      Decline
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="secondary" onClick={() => handleCancel(c.id)}>
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Status is accepted (in progress)
                        return (
                          <div key={c.id} className="rounded-control border border-accent/30 bg-accent/5 p-3.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-ink">Duel in progress: {c.topic_name}</span>
                              <span className="flex items-center gap-1 text-accent font-medium">
                                <Clock size={12} aria-hidden="true" /> Timed
                              </span>
                            </div>
                            <p className="mt-1.5 text-ink-2">
                              Compete against <strong>{otherName}</strong>. Complete your quiz before the timer expires!
                            </p>
                            <div className="mt-3">
                              {!c.my_completed && c.my_quiz_id ? (
                                <Link
                                  href={`/quizzes/${c.my_quiz_id}?duel=${c.id}`}
                                  className="inline-flex h-8 items-center rounded-control bg-ink px-3 text-xs font-semibold text-paper hover:bg-stone-800"
                                >
                                  Take duel quiz
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-medium text-success">
                                  <Check size={14} aria-hidden="true" /> You submitted! Waiting for opponent...
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        ) : null}

        {/* Send Challenge Dialog */}
        {selectedPeer ? (
          <Dialog
            open={Boolean(selectedPeer)}
            onClose={() => setSelectedPeer(null)}
            title={`Challenge ${selectedPeer.display_name}`}
          >
            <div className="space-y-4 py-2 text-sm">
              <p className="text-ink">
                Send a quiz duel challenge on <strong className="font-semibold">{selectedPeer.topic_name}</strong>.
              </p>
              <div>
                <label className="block text-xs font-medium text-ink-2">Select difficulty</label>
                <div className="mt-1.5 flex gap-2">
                  {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedDifficulty(lvl)}
                      className={cn(
                        "rounded-control border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        selectedDifficulty === lvl
                          ? "border-ink bg-ink text-paper"
                          : "border-stone bg-paper text-ink hover:bg-stone-50"
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-ink-3">
                Both players will receive a quiz generated from their own uploaded material on this topic.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSelectedPeer(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSendChallenge} loading={challenging}>
                Send challenge
              </Button>
            </DialogFooter>
          </Dialog>
        ) : null}
      </div>
    </PageContainer>
  );
}
