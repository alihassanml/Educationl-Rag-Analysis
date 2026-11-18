"use client";

import { useSyncExternalStore } from "react";

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const subscribe = () => () => undefined;

/** Greeting by the visitor's local time. The server snapshot is neutral, so nothing mismatches on hydration. */
export function useGreeting(): string {
  return useSyncExternalStore(
    subscribe,
    () => greetingFor(new Date().getHours()),
    () => "Welcome back",
  );
}
