"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import AccountLinks from "@/components/AccountLinks";
import Nav from "@/components/Nav";
import VisitorNotice from "@/components/VisitorNotice";

// The frame around every page: the top bar (app name on the left, log in / log out on the right),
// the page menu on the left, and the page itself. Everyone can use every page; people who are not
// logged in see a small note about what an account adds.
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <Link href="/" className="wordmark">AirSense</Link>
          <AccountLinks />
        </div>
      </header>
      <div className="frame frame--menu">
        <Nav />
        <main className="page">
          <VisitorNotice />
          {children}
        </main>
      </div>
      <footer className="site-footer">
        Values are a regional model estimate on a grid of about 45 km, not a reading from a station on your street.
      </footer>
    </>
  );
}
