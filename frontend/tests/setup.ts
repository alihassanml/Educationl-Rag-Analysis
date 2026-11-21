import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement scrolling; the chat auto-scrolls while an answer streams
if (typeof window !== "undefined") window.scrollTo = vi.fn();

afterEach(cleanup);
