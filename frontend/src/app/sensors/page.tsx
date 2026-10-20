"use client";

import { useEffect, useState } from "react";
import DeviceList from "@/components/DeviceList";
import SaClock from "@/components/SaClock";
import SensorChart from "@/components/SensorChart";
import { getDevices, getSensorHistory, type Device, type SensorHistory } from "@/lib/api";

const RANGES = [
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
] as const;

type State = { hours: number; devices?: Device[]; history?: SensorHistory; error?: string; now: number };

export default function SensorsPage() {
  const [hours, setHours] = useState<number>(24);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [devices, history] = await Promise.all([getDevices(), getSensorHistory(hours)]);
        if (!cancelled) setState({ hours, devices, history, now: Date.now() });
      } catch (e) {
        // keep showing the last good data if a background refresh fails
        if (!cancelled) setState((s) => (s && s.hours === hours && s.devices ? s : { hours, error: (e as Error).message, now: Date.now() }));
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hours, attempt]);

  const loading = !state || state.hours !== hours;
  const devices = !loading ? state?.devices : undefined;
  const history = !loading ? state?.history : undefined;
  const error = !loading ? state?.error : undefined;
  const now = state?.now ?? 0;
  const withData = history?.devices.filter((d) => d.points.length > 0) ?? [];

  return (
    <>
      <h1 className="forecast__title">Sensors</h1>
      <p className="section__lead">
        AirSense also listens to air-quality sensors. One is a real sensor from the Sensor.Community
        network. The others are simulated devices that stand in for sensors we don&rsquo;t have, and
        they are labelled as simulated everywhere they appear.
      </p>

      {loading && <p className="loading">Listening for sensors&hellip;</p>}

      {error && (
        <div className="notice" role="alert">
          <strong>We couldn&rsquo;t reach the sensor data.</strong>
          <p>{error}</p>
          <p>Check that the AirSense server is running, then try again.</p>
          <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}

      {devices && (
        <>
          <section className="section section--tight" aria-labelledby="dev-title">
            <h2 id="dev-title">Devices right now</h2>
            <SaClock />
            <DeviceList devices={devices} now={now} />
            <p className="section__fine">This page checks for new readings every minute.</p>
          </section>

          <section className="section" aria-labelledby="hist-title">
            <h2 id="hist-title">PM2.5 over time</h2>
            <div className="city-picker" role="group" aria-label="Choose how far back to look">
              {RANGES.map((r) => (
                <button key={r.hours} aria-pressed={hours === r.hours} onClick={() => setHours(r.hours)}>
                  {r.label}
                </button>
              ))}
            </div>
            {withData.length > 0 ? (
              <SensorChart series={withData} hours={hours} now={now} />
            ) : (
              <p className="section__lead">No readings in this time range yet.</p>
            )}
            <p className="section__fine">
              Dashed lines are simulated devices. A sensor on one street can read very differently from
              the regional estimate (a grid of about 45 km) that the forecast learns from.
            </p>
          </section>

          <section className="section" aria-labelledby="how-title">
            <h2 id="how-title">How a reading gets here</h2>
            <ol className="pipeline">
              <li>
                <strong>Device</strong>
                <span>The real sensor measures the air. Simulated devices copy regional values and add small random changes.</span>
              </li>
              <li>
                <strong>Gateway</strong>
                <span>A small program collects each reading every 5 minutes and tidies it up.</span>
              </li>
              <li>
                <strong>API</strong>
                <span>The gateway sends it to the AirSense server, which accepts it only with a secret key.</span>
              </li>
              <li>
                <strong>Database</strong>
                <span>The server stores it in PostgreSQL, ignoring duplicates.</span>
              </li>
              <li>
                <strong>This page</strong>
                <span>The page reads the stored readings back and draws them.</span>
              </li>
            </ol>
            <p className="section__fine">
              Sensor readings are shown for information. The forecast model is trained on regional
              estimates, not on these sensors.
            </p>
          </section>
        </>
      )}
    </>
  );
}