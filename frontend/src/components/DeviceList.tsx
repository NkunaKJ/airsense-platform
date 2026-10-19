import { bandFor, clockTime, timeAgo, type Device } from "@/lib/api";

const STALE_MINUTES = 30;

export default function DeviceList({ devices, now }: { devices: Device[]; now: number }) {
  return (
    <ul className="devices">
      {devices.map((d) => {
        const stale =
          d.reading_time === null || now - new Date(d.reading_time).getTime() > STALE_MINUTES * 60000;
        const band = d.pm2_5 === null ? null : bandFor(d.pm2_5);
        return (
          <li key={d.device_key} className={`device${stale ? " device--stale" : ""}`}>
            <div className="device__head">
              <span className="device__name">{d.label}</span>
              <span className={`tag ${d.is_simulated ? "tag--sim" : "tag--real"}`}>
                {d.is_simulated ? "Simulated" : "Real sensor"}
              </span>
            </div>

            {d.reading_time === null ? (
              <p className="device__when">No readings stored yet.</p>
            ) : (
              <>
                <div className="device__reading">
                  <span className="device__value">{d.pm2_5 === null ? "–" : d.pm2_5.toFixed(1)}</span>
                  <span className="device__unit">µg/m³ PM2.5</span>
                  {band && (
                    <span className="device__band" style={{ color: band.text }}>
                      {band.name}
                    </span>
                  )}
                </div>
                <dl className="device__more">
                  <div><dt>Temperature</dt><dd>{d.temperature === null ? "–" : `${d.temperature.toFixed(1)} °C`}</dd></div>
                  <div><dt>Humidity</dt><dd>{d.humidity === null ? "–" : `${Math.round(d.humidity)} %`}</dd></div>
                  <div><dt>Pressure</dt><dd>{d.pressure === null ? "–" : `${Math.round(d.pressure)} hPa`}</dd></div>
                </dl>
                <p className="device__when">
                  {stale ? "No new data for a while. Last reading " : "Last reading "}
                  {timeAgo(d.reading_time, now)} ({clockTime(d.reading_time)})
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}