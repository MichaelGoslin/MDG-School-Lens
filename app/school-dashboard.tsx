"use client";

import { useEffect, useMemo, useState } from "react";

const API = "https://data.cityofnewyork.us/resource/dnpx-dfnc.json";

type YearRow = { report_year: string; schools: string; records: string };
type TypeRow = { school_type: string; schools: string };
type MetricRow = { metric_variable_name: string; metric_display_name: string; metric_value: string };

function query(params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  return fetch(`${API}?${qs}`).then((response) => {
    if (!response.ok) throw new Error("NYC Open Data is temporarily unavailable.");
    return response.json();
  });
}

function percent(values: MetricRow[], names: string[]) {
  const selected = values.filter((row) => names.includes(row.metric_variable_name));
  const usable = selected.map((row) => Number(row.metric_value)).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

export function SchoolDashboard() {
  const [years, setYears] = useState<YearRow[]>([]);
  const [year, setYear] = useState("2025");
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    query({
      "$select": "report_year,count(distinct dbn) as schools,count(*) as records",
      "$group": "report_year",
      "$order": "report_year desc",
    }).then((data: YearRow[]) => {
      setYears(data);
      if (data[0]?.report_year) setYear(data[0].report_year);
    }).catch(() => setError("We could not reach NYC Open Data. Showing the dashboard shell."));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const where = `report_year='${year}'`;
    Promise.all([
      query({ "$select": "school_type,count(distinct dbn) as schools", "$where": where, "$group": "school_type", "$order": "schools desc" }),
      query({
        "$select": "metric_variable_name,metric_display_name,metric_value",
        "$where": `${where} and metric_variable_name in('attendance_hs_all','attendance_k3_all','attendance_k8_all','chronic_absent_all','chronic_absent_ems_all','chronic_absent_hs_all')`,
        "$limit": "5000",
      }),
    ]).then(([typeData, metricData]) => {
      setTypes(typeData as TypeRow[]);
      setMetrics(metricData as MetricRow[]);
      setUpdated(new Date());
    }).catch(() => setError("NYC Open Data is temporarily unavailable. Try refreshing shortly."))
      .finally(() => setLoading(false));
  }, [year]);

  const current = years.find((item) => item.report_year === year);
  const attendance = useMemo(() => percent(metrics, ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"]), [metrics]);
  const strongAttendance = useMemo(() => percent(metrics, ["chronic_absent_all", "chronic_absent_ems_all", "chronic_absent_hs_all"]), [metrics]);
  const maxSchools = Math.max(...types.map((item) => Number(item.schools)), 1);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">M</span><span>MDG <strong>School Lens</strong></span></div>
        <nav aria-label="Primary navigation">
          <a className="active" href="#overview"><span>⌂</span> Overview</a>
          <a href="#districts"><span>◇</span> District Explorer</a>
          <a href="#compare"><span>⇄</span> School Comparison</a>
          <a href="#profiles"><span>▤</span> School Profiles</a>
        </nav>
        <div className="sidebar-bottom">
          <a href="#health"><span>◎</span> Data Health</a>
          <p>NYC School Quality Reports</p>
          <small>Official public data</small>
        </div>
      </aside>

      <main className="main" id="overview">
        <header className="topbar">
          <div><p className="eyebrow">Executive overview</p><h1>School system pulse</h1></div>
          <div className="controls">
            <label>Reporting year
              <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Reporting year">
                {(years.length ? years : [{ report_year: "2025", schools: "", records: "" }]).map((item) => <option key={item.report_year}>{item.report_year}</option>)}
              </select>
            </label>
            <button onClick={() => window.location.reload()} aria-label="Refresh live data">↻ Refresh</button>
          </div>
        </header>

        <section className="status-strip" id="health">
          <span className={error ? "status-dot warning" : "status-dot"} />
          <strong>{error ? "Connection needs attention" : "Live source connected"}</strong>
          <span>{error || `Latest successful refresh ${updated ? updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "in progress"}`}</span>
          <span className="source">NYC Open Data · dnpx-dfnc</span>
        </section>

        <section className="intro">
          <div><h2>Good morning, Administrator.</h2><p>A citywide view of coverage, attendance, and school-type context for the {year} report year.</p></div>
          <div className="pill">Annual reporting data</div>
        </section>

        <section className="kpi-grid" aria-label="Key indicators">
          <article><span className="kpi-icon blue">▦</span><div><p>Schools represented</p><strong>{loading ? "—" : Number(current?.schools || 0).toLocaleString()}</strong><small>Distinct school DBNs</small></div></article>
          <article><span className="kpi-icon green">✓</span><div><p>Average attendance</p><strong>{attendance === null ? "—" : `${(attendance * 100).toFixed(1)}%`}</strong><small>Across reported schools</small></div></article>
          <article><span className="kpi-icon amber">↗</span><div><p>Students above 90%</p><strong>{strongAttendance === null ? "—" : `${(strongAttendance * 100).toFixed(1)}%`}</strong><small>Attendance threshold</small></div></article>
          <article><span className="kpi-icon violet">●</span><div><p>Published records</p><strong>{loading ? "—" : compact(Number(current?.records || 0))}</strong><small>Metric observations</small></div></article>
        </section>

        <section className="content-grid">
          <article className="panel comparison" id="compare">
            <div className="panel-head"><div><p className="eyebrow">System composition</p><h3>Schools by type</h3></div><span>{year}</span></div>
            <div className="bars">
              {loading && <p className="muted">Loading live comparison…</p>}
              {!loading && types.slice(0, 7).map((item, index) => (
                <div className="bar-row" key={item.school_type || "Unclassified"}>
                  <span>{item.school_type || "Unclassified"}</span>
                  <div className="track"><i style={{ width: `${Math.max(5, Number(item.schools) / maxSchools * 100)}%`, animationDelay: `${index * 70}ms` }} /></div>
                  <strong>{Number(item.schools).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="panel attention">
            <div className="panel-head"><div><p className="eyebrow">Decision support</p><h3>Administrator focus</h3></div><span className="live-tag">LIVE</span></div>
            <div className="focus-item"><span>01</span><div><strong>Review attendance context</strong><p>Compare school results with peer groups before escalating support.</p></div></div>
            <div className="focus-item"><span>02</span><div><strong>Check reporting coverage</strong><p>Missing values may indicate suppression or non-applicable measures.</p></div></div>
            <div className="focus-item"><span>03</span><div><strong>Move from signal to profile</strong><p>Use the next build to drill into individual schools and trends.</p></div></div>
          </article>
        </section>

        <section className="panel timeline" id="districts">
          <div className="panel-head"><div><p className="eyebrow">Data history</p><h3>Coverage by report year</h3></div><span>{years.length} reporting years available</span></div>
          <div className="year-cards">
            {years.slice(0, 6).reverse().map((item) => <button key={item.report_year} onClick={() => setYear(item.report_year)} className={year === item.report_year ? "selected" : ""}><strong>{item.report_year}</strong><span>{Number(item.schools).toLocaleString()} schools</span></button>)}
          </div>
        </section>

        <footer><span>MDG School Lens</span><span>Source: NYC School Quality Reports Data</span></footer>
      </main>
    </div>
  );
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
