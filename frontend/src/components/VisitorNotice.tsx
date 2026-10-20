"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth";

// A small, dismissible note for people who are not logged in. They can still use every page;
// the note only tells them what an account adds. "Dismiss" hides it until the tab is closed.
const KEY = "airsense.visitorNoticeDismissed";
const EVENT = "airsense-notice";

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export default function VisitorNotice() {
  const session = useSession();
  // true on the server and during hydration, so nothing flashes in and out
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (session || dismissed) return null;

  return (
    <aside className="visitor-notice" aria-label="Create an account">
      <p>
        You are using AirSense as a visitor. <Link href="/register">Create a free account</Link> to save forecasts,
        add notes and download your list.
      </p>
      <button
        type="button"
        className="visitor-notice__close"
        aria-label="Dismiss this note"
        onClick={() => {
          try {
            window.sessionStorage.setItem(KEY, "1");
          } catch {
            /* storage blocked: the note comes back on the next page load */
          }
          window.dispatchEvent(new Event(EVENT));
        }}
      >
        Dismiss
      </button>
    </aside>
  );
}
