"use client";

import { useEffect, useState } from "react";
import { exactSast } from "@/lib/api";

// A live clock in South African time. It starts empty and fills in after the page loads.
export default function SaClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="saclock">
      South African time now: <strong>{now === null ? "…" : `${exactSast(now)} SAST`}</strong>
    </p>
  );
}