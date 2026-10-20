"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, useSession } from "@/lib/auth";

// The account part of the top bar: log in or register, or who is signed in and a log out button.
export default function AccountLinks() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (!session) {
    return (
      <nav className="account" aria-label="Account">
        <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined}>Log in</Link>
        <Link href="/register" aria-current={pathname === "/register" ? "page" : undefined}>Register</Link>
      </nav>
    );
  }
  return (
    <div className="account">
      <span className="account__who">Hi, {session.name.split(" ")[0]}</span>
      <button
        className="account__out"
        onClick={async () => {
          await logout();
          router.push("/");
        }}
      >
        Log out
      </button>
    </div>
  );
}
