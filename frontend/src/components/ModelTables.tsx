import { cityName, fullDate, num, type ModelResult, type TestWindowRow } from "@/lib/api";

export function ResultsTable({ results }: { results: ModelResult[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">City</th>
            <th scope="col">Model</th>
            <th scope="col">Typical miss</th>
            <th scope="col">&ldquo;Tomorrow = today&rdquo; miss</th>
            <th scope="col">Better by</th>
            <th scope="col">R&sup2;</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.city_key}>
              <th scope="row">{r.city_name ?? cityName(r.city_key)}</th>
              <td>{r.model_name}</td>
              <td>{num(r.test_mae)} µg/m³</td>
              <td>{num(r.baseline_test_mae)} µg/m³</td>
              <td>{r.improvement_pct === null ? "–" : `${r.improvement_pct}%`}</td>
              <td>{num(r.test_r2, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TestWindowTable({ rows }: { rows: TestWindowRow[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">City</th>
            <th scope="col">Test period starts</th>
            <th scope="col">Training average</th>
            <th scope="col">Test average</th>
            <th scope="col">Training worst 10%</th>
            <th scope="col">Test worst 10%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.city_key}>
              <th scope="row">{cityName(r.city_key)}</th>
              <td>{fullDate(r.test_start)}</td>
              <td>{num(r.train_mean)}</td>
              <td>{num(r.test_mean)}</td>
              <td>{num(r.train_p90)}</td>
              <td>{num(r.test_p90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}