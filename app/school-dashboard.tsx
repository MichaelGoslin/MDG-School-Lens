"use client";

import { useEffect, useMemo, useState } from "react";

const API = "https://data.cityofnewyork.us/resource/dnpx-dfnc.json";
const AVERAGE_ATTENDANCE_VARIABLES = ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"];
const NINETY_PERCENT_ATTENDANCE_VARIABLES = ["chronic_absent_all", "chronic_absent_ems_all", "chronic_absent_hs_all"];
const DISTRICT_LABELS: Record<string, string> = {
  "01":"Manhattan · Lower East Side / East Village", "02":"Manhattan · Lower Manhattan / Midtown / Upper East Side", "03":"Manhattan · Upper West Side / West Harlem", "04":"Manhattan · East Harlem", "05":"Manhattan · Central Harlem / Morningside Heights", "06":"Manhattan · Washington Heights / Inwood",
  "07":"Bronx · Mott Haven / Port Morris", "08":"Bronx · Hunts Point / Soundview / Throgs Neck", "09":"Bronx · Morrisania / Highbridge", "10":"Bronx · Riverdale / Fordham / Kingsbridge", "11":"Bronx · Northeast Bronx / Co-op City", "12":"Bronx · East Tremont / Crotona Park",
  "13":"Brooklyn · Downtown / Fort Greene / Brooklyn Heights", "14":"Brooklyn · Williamsburg / Greenpoint", "15":"Brooklyn · Park Slope / Sunset Park / Red Hook", "16":"Brooklyn · Bedford-Stuyvesant", "17":"Brooklyn · Crown Heights / East Flatbush", "18":"Brooklyn · Canarsie / East Flatbush", "19":"Brooklyn · East New York", "20":"Brooklyn · Bay Ridge / Bensonhurst", "21":"Brooklyn · Coney Island / Brighton Beach", "22":"Brooklyn · Flatbush / Marine Park", "23":"Brooklyn · Brownsville / Ocean Hill", "24":"Queens · Corona / Elmhurst / Ridgewood", "25":"Queens · Flushing / Whitestone", "26":"Queens · Bayside / Fresh Meadows", "27":"Queens · Far Rockaway / Howard Beach", "28":"Queens · Jamaica / Forest Hills", "29":"Queens · Southeast Queens", "30":"Queens · Astoria / Long Island City / Jackson Heights", "31":"Staten Island · Boroughwide", "32":"Brooklyn · Bushwick",
};
const OUTCOME_METRICS = [
  { key: "attendance", label: "Attendance", short: "Attendance", variables: ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"] },
  { key: "ela", label: "ELA proficiency", short: "ELA", variables: ["prof_pct_ela_all"] },
  { key: "math", label: "Math proficiency", short: "Math", variables: ["prof_pct_mth_all"] },
  { key: "graduation", label: "4-year graduation", short: "Graduation", variables: ["grad_pct_4_all"] },
  { key: "readiness", label: "College & career", short: "Readiness", variables: ["pct_cpci_all"] },
] as const;
const OUTCOME_VARIABLES = OUTCOME_METRICS.flatMap((metric) => metric.variables).map((variable) => `'${variable}'`).join(",");

type YearRow = { report_year: string; schools: string; records: string };
type TypeRow = { school_type: string; schools: string };
type MetricRow = { metric_variable_name: string; metric_display_name: string; metric_value: string };
type SchoolRow = { dbn: string; school_name: string; school_type: string };
type ProfileRow = MetricRow & { report_year: string; comparison_group_average?: string; number_of_students?: string };
type DistrictMetricRow = SchoolRow & { metric_variable_name: string; metric_value: string };
type Signal = { status: "improving" | "stable" | "review" | "insufficient"; label: string; reason: string };

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
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [selectedDbn, setSelectedDbn] = useState("");
  const [profile, setProfile] = useState<ProfileRow[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [districtMetrics, setDistrictMetrics] = useState<DistrictMetricRow[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState("01");
  const [compareDbns, setCompareDbns] = useState<[string, string]>(["", ""]);
  const [comparisonProfiles, setComparisonProfiles] = useState<Record<string, ProfileRow[]>>({});
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<(typeof OUTCOME_METRICS)[number]["key"]>("attendance");
  const [briefingMode, setBriefingMode] = useState<"district" | "comparison" | "profile">("comparison");

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
      query({ "$select": "dbn,school_name,school_type", "$where": where, "$group": "dbn,school_name,school_type", "$order": "school_name", "$limit": "5000" }),
      query({
        "$select": "dbn,school_name,school_type,metric_variable_name,metric_value",
        "$where": `${where} and metric_variable_name in('attendance_hs_all','attendance_k3_all','attendance_k8_all','chronic_absent_all','chronic_absent_ems_all','chronic_absent_hs_all')`,
        "$limit": "5000",
      }),
    ]).then(([typeData, metricData, schoolData, districtMetricData]) => {
      setTypes(typeData as TypeRow[]);
      setMetrics(metricData as MetricRow[]);
      const availableSchools = Array.from(new Map((schoolData as SchoolRow[]).map((school) => [school.dbn, school])).values());
      setSchools(availableSchools);
      setDistrictMetrics(districtMetricData as DistrictMetricRow[]);
      if (!selectedDbn || !availableSchools.some((school) => school.dbn === selectedDbn)) {
        setSelectedDbn(availableSchools[0]?.dbn || "");
        setSchoolSearch(availableSchools[0] ? `${availableSchools[0].school_name} · ${availableSchools[0].dbn}` : "");
      }
      setCompareDbns((current) => [
        availableSchools.some((school) => school.dbn === current[0]) ? current[0] : (availableSchools[0]?.dbn || ""),
        availableSchools.some((school) => school.dbn === current[1]) ? current[1] : (availableSchools[1]?.dbn || availableSchools[0]?.dbn || ""),
      ]);
      setUpdated(new Date());
    }).catch(() => setError("NYC Open Data is temporarily unavailable. Try refreshing shortly."))
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    if (!selectedDbn) return;
    setProfileLoading(true);
    const variables = `${OUTCOME_VARIABLES},'chronic_absent_all','chronic_absent_ems_all','chronic_absent_hs_all'`;
    query({
      "$select": "report_year,metric_variable_name,metric_display_name,metric_value,comparison_group_average,number_of_students",
      "$where": `dbn='${selectedDbn}' and metric_variable_name in(${variables})`,
      "$order": "report_year",
      "$limit": "500",
    }).then((data: ProfileRow[]) => setProfile(data)).catch(() => setProfile([])).finally(() => setProfileLoading(false));
  }, [selectedDbn]);

  useEffect(() => {
    const dbns = Array.from(new Set(compareDbns.filter(Boolean)));
    if (!dbns.length) return;
    setComparisonLoading(true);
    Promise.all(dbns.map((dbn) => query({
      "$select": "report_year,metric_variable_name,metric_display_name,metric_value,comparison_group_average,number_of_students",
      "$where": `dbn='${dbn}' and metric_variable_name in(${OUTCOME_VARIABLES})`,
      "$order": "report_year",
      "$limit": "100",
    }).then((rows: ProfileRow[]) => [dbn, rows] as const)))
      .then((entries) => setComparisonProfiles(Object.fromEntries(entries)))
      .catch(() => setComparisonProfiles({}))
      .finally(() => setComparisonLoading(false));
  }, [compareDbns]);

  const current = years.find((item) => item.report_year === year);
  const attendance = useMemo(() => percent(metrics, AVERAGE_ATTENDANCE_VARIABLES), [metrics]);
  const strongAttendance = useMemo(() => percent(metrics, NINETY_PERCENT_ATTENDANCE_VARIABLES), [metrics]);
  const maxSchools = Math.max(...types.map((item) => Number(item.schools)), 1);
  const selectedSchool = schools.find((school) => school.dbn === selectedDbn);
  const schoolOptions = useMemo(() => schools.filter((school) => `${school.school_name} ${school.dbn}`.toLowerCase().includes(schoolSearch.toLowerCase().split(" · ")[0])).slice(0, 8), [schools, schoolSearch]);
  const selectedOutcomeMetric = OUTCOME_METRICS.find((metric) => metric.key === selectedOutcome) || OUTCOME_METRICS[0];
  const outcomeTrend = useMemo(() => {
    return years.slice().reverse().map((item) => {
      const rows = profile.filter((row) => row.report_year === item.report_year && selectedOutcomeMetric.variables.includes(row.metric_variable_name as never));
      const value = rows.length ? Number(rows[0].metric_value) : null;
      return { year: item.report_year, value: value !== null && Number.isFinite(value) ? value : null };
    }).filter((item) => item.value !== null);
  }, [profile, years, selectedOutcomeMetric]);
  const latestOutcome = outcomeTrend.find((item) => item.year === year)?.value ?? outcomeTrend.at(-1)?.value ?? null;
  const latestProfileRow = profile.find((row) => row.report_year === year && selectedOutcomeMetric.variables.includes(row.metric_variable_name as never)) || profile.filter((row) => selectedOutcomeMetric.variables.includes(row.metric_variable_name as never)).at(-1);
  const peerOutcome = latestProfileRow?.comparison_group_average ? Number(latestProfileRow.comparison_group_average) : null;
  const profileSignal = buildSignal(outcomeTrend.map((point) => point.value as number), latestOutcome, peerOutcome, selectedOutcomeMetric.short);
  const districts = useMemo(() => Array.from(new Set(schools.map((school) => school.dbn.slice(0, 2)).filter((district) => /^\d{2}$/.test(district)))).sort(), [schools]);
  const districtSchools = useMemo(() => schools.filter((school) => school.dbn.startsWith(selectedDistrict)), [schools, selectedDistrict]);
  const attendanceMeasure = attendance !== null ? "average" : "above90";
  const attendanceMeasureLabel = attendanceMeasure === "average" ? "Average attendance" : "Students with 90%+ attendance";
  const citywideAttendanceMeasure = attendanceMeasure === "average" ? attendance : strongAttendance;
  const districtAttendanceRows = useMemo(() => {
    const variables = attendanceMeasure === "average" ? AVERAGE_ATTENDANCE_VARIABLES : NINETY_PERCENT_ATTENDANCE_VARIABLES;
    return districtMetrics.filter((row) => row.dbn.startsWith(selectedDistrict) && variables.includes(row.metric_variable_name) && Number.isFinite(Number(row.metric_value)));
  }, [districtMetrics, selectedDistrict, attendanceMeasure]);
  const districtAttendance = districtAttendanceRows.length ? districtAttendanceRows.reduce((sum, row) => sum + Number(row.metric_value), 0) / districtAttendanceRows.length : null;
  const districtSignal = buildSignal([], districtAttendance, citywideAttendanceMeasure, attendanceMeasureLabel);
  const districtTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    districtSchools.forEach((school) => counts.set(school.school_type || "Unclassified", (counts.get(school.school_type || "Unclassified") || 0) + 1));
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [districtSchools]);
  const districtSchoolSignals = useMemo(() => districtAttendanceRows.slice().sort((a, b) => Number(b.metric_value) - Number(a.metric_value)), [districtAttendanceRows]);
  const comparedSchools = compareDbns.map((dbn) => schools.find((school) => school.dbn === dbn)).filter((school): school is SchoolRow => Boolean(school));

  function comparisonSnapshot(dbn: string) {
    const rows = (comparisonProfiles[dbn] || []).filter((row) => selectedOutcomeMetric.variables.includes(row.metric_variable_name as never));
    const latest = rows.find((row) => row.report_year === year) || rows.at(-1);
    const value = latest && Number.isFinite(Number(latest.metric_value)) ? Number(latest.metric_value) : null;
    const peer = latest?.comparison_group_average && Number.isFinite(Number(latest.comparison_group_average)) ? Number(latest.comparison_group_average) : null;
    const trend = years.slice().reverse().map((item) => ({ year: item.report_year, row: rows.find((row) => row.report_year === item.report_year) })).filter((item) => item.row && Number.isFinite(Number(item.row.metric_value)));
    const values = trend.map((item) => Number(item.row?.metric_value));
    return { value, peer, trend, reportedYear: latest?.report_year || "—", students: latest?.number_of_students || "—", signal: buildSignal(values, value, peer, selectedOutcomeMetric.short) };
  }

  function openSchoolProfile(school: SchoolRow) {
    setSelectedDbn(school.dbn);
    setSchoolSearch(`${school.school_name} · ${school.dbn}`);
    window.setTimeout(() => document.getElementById("profiles")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function printBriefing(mode: "district" | "comparison" | "profile") {
    setBriefingMode(mode);
    window.setTimeout(() => window.print(), 80);
  }

  function briefingSnapshot(rows: ProfileRow[], metric: (typeof OUTCOME_METRICS)[number]) {
    const relevant = rows.filter((row) => metric.variables.includes(row.metric_variable_name as never));
    const latest = relevant.find((row) => row.report_year === year) || relevant.at(-1);
    const value = latest && Number.isFinite(Number(latest.metric_value)) ? Number(latest.metric_value) : null;
    const peer = latest?.comparison_group_average && Number.isFinite(Number(latest.comparison_group_average)) ? Number(latest.comparison_group_average) : null;
    const values = years.slice().reverse().map((item) => relevant.find((row) => row.report_year === item.report_year)).filter(Boolean).map((row) => Number(row?.metric_value)).filter(Number.isFinite);
    return { value, peer, signal: buildSignal(values, value, peer, metric.short) };
  }

  function schoolSummary(rows: ProfileRow[], schoolName: string) {
    const results = OUTCOME_METRICS.map((metric) => ({ metric, ...briefingSnapshot(rows, metric) }));
    const reported = results.filter((item) => item.value !== null);
    const review = reported.filter((item) => item.signal.status === "review");
    const improving = reported.filter((item) => item.signal.status === "improving");
    const peerGaps = reported.filter((item) => item.peer !== null).map((item) => ({ ...item, gap: item.value! - item.peer! })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    const observations = [`${schoolName} reports ${reported.length} of ${OUTCOME_METRICS.length} briefing metrics for ${year}.`];
    if (review.length) observations.push(`${review.length} ${review.length === 1 ? "metric warrants" : "metrics warrant"} review: ${review.map((item) => item.metric.short).join(", ")}.`);
    else if (reported.length) observations.push("No reported metric meets the current Needs Review thresholds.");
    if (improving.length) observations.push(`Improving signals appear in ${improving.map((item) => item.metric.short).join(", ")}.`);
    else if (peerGaps.length) {
      const item = peerGaps[0];
      observations.push(`${item.metric.short} has the largest reported peer difference at ${Math.abs(item.gap * 100).toFixed(1)} points ${item.gap >= 0 ? "above" : "below"} the comparison group.`);
    } else observations.push("Peer context is not available for the reported briefing metrics.");
    return observations.slice(0, 3);
  }

  function districtSummary() {
    const observations = [`District ${Number(selectedDistrict)} includes ${districtSchools.length} schools across ${districtTypeCounts.length} reported school configurations.`];
    if (districtAttendance !== null && citywideAttendanceMeasure !== null) {
      const gap = districtAttendance - citywideAttendanceMeasure;
      observations.push(`${attendanceMeasureLabel} is ${(districtAttendance * 100).toFixed(1)}%, ${Math.abs(gap * 100).toFixed(1)} points ${gap >= 0 ? "above" : "below"} the citywide value for ${year}.`);
    } else observations.push(`Comparable district and citywide attendance values are not both available for ${year}.`);
    observations.push(districtSignal.status === "review" ? "The attendance signal meets the current Needs Review threshold." : districtSignal.status === "insufficient" ? "Available attendance data is insufficient for a directional signal." : `The district attendance signal is ${districtSignal.label.toLowerCase()}.`);
    return observations;
  }

  function comparisonSummary() {
    const results = comparedSchools.map((school) => ({ school, metrics: OUTCOME_METRICS.map((metric) => ({ metric, ...briefingSnapshot(comparisonProfiles[school.dbn] || [], metric) })) }));
    const observations = [`The comparison covers ${comparedSchools.length} schools and ${OUTCOME_METRICS.length} outcome measures for ${year}.`];
    const reviewDetails = results.map((item) => ({ name: item.school.school_name, metrics: item.metrics.filter((metric) => metric.signal.status === "review") })).filter((item) => item.metrics.length);
    if (reviewDetails.length) observations.push(reviewDetails.map((item) => `${item.name}: ${item.metrics.map((metric) => metric.metric.short).join(", ")}`).join("; ") + " meet the Needs Review threshold.");
    else observations.push("Neither school has a reported metric meeting the current Needs Review threshold.");
    const gaps = OUTCOME_METRICS.map((metric) => {
      const values = results.map((item) => item.metrics.find((result) => result.metric.key === metric.key)?.value ?? null);
      return values.every((value) => value !== null) ? { metric, gap: values[0]! - values[1]! } : null;
    }).filter((item): item is { metric: (typeof OUTCOME_METRICS)[number]; gap: number } => Boolean(item)).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    if (gaps.length) {
      const largest = gaps[0];
      observations.push(`${largest.metric.short} shows the largest reported difference between the two schools at ${Math.abs(largest.gap * 100).toFixed(1)} points.`);
    } else observations.push("The schools do not share enough reported measures for a direct outcome-gap observation.");
    return observations;
  }

  return (
    <div className={`app-shell ${loading ? "is-refreshing" : ""}`} aria-busy={loading}>
      <div className={`load-progress ${loading ? "visible" : ""}`} role="status" aria-live="polite">
        <i /><span>{loading ? `Loading ${year} School Quality Reports…` : "Data updated"}</span>
      </div>
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
              <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Reporting year" disabled={loading}>
                {(years.length ? years : [{ report_year: "2025", schools: "", records: "" }]).map((item) => <option key={item.report_year}>{item.report_year}</option>)}
              </select>
            </label>
            <button onClick={() => window.location.reload()} aria-label="Refresh live data" disabled={loading}>↻ Refresh</button>
          </div>
        </header>

        <section className="status-strip" id="health">
          <span className={error ? "status-dot warning" : loading ? "status-dot loading" : "status-dot"} />
          <strong>{error ? "Connection needs attention" : loading ? `Loading ${year} reports` : "Live source connected"}</strong>
          <span>{error || (loading ? "Keeping the current view visible while new data arrives…" : `Latest successful refresh ${updated ? updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "in progress"}`)}</span>
          <span className="source">NYC Open Data · dnpx-dfnc</span>
        </section>

        <section className="intro">
          <div><h2>Good morning, Administrator.</h2><p>A citywide view of coverage, attendance, and school-type context for the {year} report year.</p></div>
          <div className="pill">Annual reporting data</div>
        </section>

        <section className="kpi-grid" aria-label="Key indicators">
          <article><span className="kpi-icon blue">▦</span><div><p>Schools represented</p><strong className={loading ? "skeleton-value" : ""}>{loading ? "000" : Number(current?.schools || 0).toLocaleString()}</strong><small>Distinct school DBNs</small></div></article>
          <article><span className="kpi-icon green">✓</span><div><p>{attendanceMeasure === "average" ? "Average attendance" : "90%+ attendance rate"}</p><strong>{citywideAttendanceMeasure === null ? "Not reported" : `${(citywideAttendanceMeasure * 100).toFixed(1)}%`}</strong><small>{attendanceMeasure === "average" ? "Across reported schools" : "Historical attendance indicator"}</small></div></article>
          <article><span className="kpi-icon amber">↗</span><div><p>Students above 90%</p><strong>{strongAttendance === null ? "—" : `${(strongAttendance * 100).toFixed(1)}%`}</strong><small>Attendance threshold</small></div></article>
          <article><span className="kpi-icon violet">●</span><div><p>Published records</p><strong className={loading ? "skeleton-value" : ""}>{loading ? "000K" : compact(Number(current?.records || 0))}</strong><small>Metric observations</small></div></article>
        </section>

        <section className="content-grid">
          <article className="panel comparison" id="composition">
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
            <div className="focus-item"><span>01</span><div><strong>Signals describe metrics</strong><p>Improving, Stable, and Needs Review labels never rate an entire school.</p></div></div>
            <div className="focus-item"><span>02</span><div><strong>Trend threshold: 2 points</strong><p>Changes of at least two percentage points are treated as meaningful.</p></div></div>
            <div className="focus-item"><span>03</span><div><strong>Peer gap threshold: 3 points</strong><p>A latest result three or more points below its peer group prompts review.</p></div></div>
          </article>
        </section>

        <section className="district-section" id="districts">
          <div className="profile-title district-title">
            <div><p className="eyebrow">Geographic intelligence</p><h2>District Explorer</h2><p>Review district coverage, attendance context, school mix, and schools that warrant a closer look.</p><button className="export-button" onClick={() => printBriefing("district")}>⇩ Export district briefing</button></div>
            <label className="district-select">Community school district
              <select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} aria-label="Community school district" disabled={loading}>
                {districts.map((district) => <option value={district} key={district}>District {Number(district)} — {DISTRICT_LABELS[district]}</option>)}
              </select>
            </label>
          </div>

          <div className="district-banner">
            <div><span>NYCPS</span><h3>Community School District {Number(selectedDistrict)}</h3><p>{DISTRICT_LABELS[selectedDistrict]} · {year} School Quality Reports</p></div>
            <div className="district-summary"><strong>{districtSchools.length}</strong><span>schools represented</span></div>
          </div>

          <div className="district-kpis">
            <article><p>District attendance</p><strong>{districtAttendance === null ? "Not reported" : `${(districtAttendance * 100).toFixed(1)}%`}</strong><small>{attendanceMeasureLabel} across reporting schools</small></article>
            <article><p>Citywide attendance</p><strong>{citywideAttendanceMeasure === null ? "Not reported" : `${(citywideAttendanceMeasure * 100).toFixed(1)}%`}</strong><small>{attendanceMeasureLabel} · same report year</small></article>
            <article><p>District difference</p><strong className={districtAttendance !== null && citywideAttendanceMeasure !== null && districtAttendance >= citywideAttendanceMeasure ? "positive" : "negative"}>{districtAttendance !== null && citywideAttendanceMeasure !== null ? `${((districtAttendance - citywideAttendanceMeasure) * 100).toFixed(1)} pts` : "Not reported"}</strong><small>District versus citywide</small></article>
            <article><p>School types</p><strong>{districtTypeCounts.length}</strong><small>Reported configurations</small></article>
          </div>
          <div className="district-signal"><SignalBadge signal={districtSignal} /><p>{districtSignal.reason}</p></div>

          <div className="district-grid">
            <article className="panel">
              <div className="panel-head"><div><p className="eyebrow">District composition</p><h3>Schools by type</h3></div><span>District {Number(selectedDistrict)}</span></div>
              <div className="district-types">
                {districtTypeCounts.map((item) => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(8, item.value / Math.max(...districtTypeCounts.map((row) => row.value), 1) * 100)}%` }} /></div><strong>{item.value}</strong></div>)}
              </div>
            </article>

            <article className="panel district-schools">
              <div className="panel-head"><div><p className="eyebrow">School signals</p><h3>Attendance range</h3></div><span>Open a profile</span></div>
              {districtSchoolSignals.length ? <div className="signal-list">
                {districtSchoolSignals.slice(0, 4).map((school, index) => <button key={`${school.dbn}-${index}`} onClick={() => openSchoolProfile(school)}><span className="signal-rank">{String(index + 1).padStart(2, "0")}</span><span><strong>{school.school_name}</strong><small>{school.dbn} · {school.school_type}</small></span><b>{(Number(school.metric_value) * 100).toFixed(1)}%</b></button>)}
              </div> : <p className="muted">No attendance observations are reported for this district and year.</p>}
              <p className="context-note">This list surfaces reported attendance values for exploration. It is not a school ranking or accountability determination.</p>
            </article>
          </div>
        </section>

        <section className="compare-section" id="compare">
          <div className="profile-title">
            <div><p className="eyebrow">Side-by-side intelligence</p><h2>School Comparison</h2><p>Compare two schools across attendance, peer context, coverage, and reporting history.</p><button className="export-button" onClick={() => printBriefing("comparison")}>⇩ Export comparison briefing</button></div>
          </div>
          <div className="compare-selectors">
            {([0, 1] as const).map((position) => <label key={position}>School {position + 1}
              <select value={compareDbns[position]} disabled={loading || comparisonLoading} onChange={(event) => setCompareDbns((current) => position === 0 ? [event.target.value, current[1]] : [current[0], event.target.value])}>
                {schools.map((school) => <option value={school.dbn} key={`${position}-${school.dbn}`}>{school.school_name} · {school.dbn}</option>)}
              </select>
            </label>)}
          </div>
          <div className="metric-tabs compare-tabs" role="group" aria-label="Comparison metric">
            {OUTCOME_METRICS.map((metric) => <button key={metric.key} className={selectedOutcome === metric.key ? "selected" : ""} onClick={() => setSelectedOutcome(metric.key)}>{metric.label}</button>)}
          </div>

          <div className="comparison-board">
            {comparedSchools.map((school, index) => {
              const snapshot = comparisonSnapshot(school.dbn);
              return <article className={`comparison-card school-${index + 1}`} key={school.dbn}>
                <div className="comparison-card-head"><span>{school.dbn}</span><div><h3>{school.school_name}</h3><p>{school.school_type} · District {Number(school.dbn.slice(0, 2))}</p></div><button onClick={() => openSchoolProfile(school)}>Open profile</button></div>
                <div className="card-signal"><SignalBadge signal={snapshot.signal} /><span>{snapshot.signal.reason}</span></div>
                <div className="comparison-metrics">
                  <div><span>{selectedOutcomeMetric.short}</span><strong>{snapshot.value === null ? "—" : `${(snapshot.value * 100).toFixed(1)}%`}</strong></div>
                  <div><span>Peer group</span><strong>{snapshot.peer === null ? "—" : `${(snapshot.peer * 100).toFixed(1)}%`}</strong></div>
                  <div><span>Peer difference</span><strong className={snapshot.value !== null && snapshot.peer !== null && snapshot.value >= snapshot.peer ? "positive" : "negative"}>{snapshot.value !== null && snapshot.peer !== null ? `${((snapshot.value - snapshot.peer) * 100).toFixed(1)} pts` : "—"}</strong></div>
                  <div><span>Students represented</span><strong>{snapshot.students}</strong></div>
                </div>
                <div className="mini-trend">
                  <div className="mini-trend-head"><span>Multi-year {selectedOutcomeMetric.short.toLowerCase()}</span><small>{snapshot.trend.length} years reported</small></div>
                  <div className="mini-bars">{snapshot.trend.map(({ year: trendYear, row }) => <div key={trendYear} title={`${trendYear}: ${(Number(row?.metric_value) * 100).toFixed(1)}%`}><span>{(Number(row?.metric_value) * 100).toFixed(0)}</span><i style={{ height: `${Math.max(10, (Number(row?.metric_value) - .7) * 290)}%` }} /><small>{trendYear.slice(-2)}</small></div>)}</div>
                </div>
              </article>;
            })}
          </div>
          {comparisonLoading && <p className="compare-loading">Updating comparison from NYC Open Data…</p>}
          <p className="comparison-note">Friendly district labels use boroughs and representative neighborhoods for orientation; official NYCPS district identities remain numeric. Comparisons provide context and should not be interpreted as rankings.</p>
        </section>

        <section className="panel timeline" id="history">
          <div className="panel-head"><div><p className="eyebrow">Data history</p><h3>Coverage by report year</h3></div><span>{years.length} reporting years available</span></div>
          <div className="year-cards">
            {years.slice(0, 6).reverse().map((item) => <button key={item.report_year} onClick={() => setYear(item.report_year)} className={year === item.report_year ? "selected" : ""}><strong>{item.report_year}</strong><span>{Number(item.schools).toLocaleString()} schools</span></button>)}
          </div>
        </section>

        <section className="profile-section" id="profiles">
          <div className="profile-title">
            <div><p className="eyebrow">School intelligence</p><h2>School profile</h2><p>Find a school and review its multi-year attendance signal against the official peer group.</p><button className="export-button" onClick={() => printBriefing("profile")}>⇩ Export school briefing</button></div>
            <div className="school-finder">
              <label htmlFor="school-search">Search by school name or DBN</label>
              <input id="school-search" value={schoolSearch} onChange={(event) => setSchoolSearch(event.target.value)} placeholder="Start typing a school name…" autoComplete="off" />
              {schoolSearch && !schoolSearch.includes(" · ") && schoolOptions.length > 0 && <div className="school-results">
                {schoolOptions.map((school) => <button key={school.dbn} onClick={() => { setSelectedDbn(school.dbn); setSchoolSearch(`${school.school_name} · ${school.dbn}`); }}><strong>{school.school_name}</strong><span>{school.dbn} · {school.school_type}</span></button>)}
              </div>}
            </div>
          </div>

          <div className="school-identity">
            <span className="school-badge">{selectedSchool?.dbn.slice(-3) || "NYC"}</span>
            <div><h3>{selectedSchool?.school_name || (profileLoading ? "Loading school profile…" : "Select a school")}</h3><p>{selectedSchool?.dbn} {selectedSchool?.school_type ? `· ${selectedSchool.school_type}` : ""}</p></div>
            <span className="profile-year">Latest view · {year}</span>
          </div>

          <div className="metric-tabs profile-tabs" role="group" aria-label="School profile metric">
            {OUTCOME_METRICS.map((metric) => <button key={metric.key} className={selectedOutcome === metric.key ? "selected" : ""} onClick={() => setSelectedOutcome(metric.key)}>{metric.label}</button>)}
          </div>

          <div className="profile-grid">
            <article className="panel trend-panel">
              <div className="panel-head"><div><p className="eyebrow">Longitudinal view</p><h3>{selectedOutcomeMetric.label}</h3></div><span>{outcomeTrend.length} years reported</span></div>
              {profileLoading ? <p className="muted">Loading school history…</p> : outcomeTrend.length ? <div className="trend-chart" aria-label={`${selectedOutcomeMetric.label} trend by year`}>
                {outcomeTrend.map((point) => <div className="trend-column" key={point.year} title={`${point.year}: ${((point.value || 0) * 100).toFixed(1)}%`}><span>{((point.value || 0) * 100).toFixed(0)}%</span><div><i style={{ height: `${Math.max(8, ((point.value || 0) - .25) * 130)}%` }} /></div><small>{point.year.slice(-2)}</small></div>)}
              </div> : <p className="muted">This metric is not reported for this school type or reporting period.</p>}
            </article>

            <article className="panel peer-panel">
              <div className="panel-head"><div><p className="eyebrow">Context matters</p><h3>Peer comparison</h3></div><span>{year}</span></div>
              <div className="profile-signal"><SignalBadge signal={profileSignal} /><p>{profileSignal.reason}</p></div>
              <div className="comparison-score"><strong>{latestOutcome === null ? "—" : `${(latestOutcome * 100).toFixed(1)}%`}</strong><span>School {selectedOutcomeMetric.short.toLowerCase()}</span></div>
              <div className="peer-line"><span>Comparison group</span><strong>{peerOutcome !== null && Number.isFinite(peerOutcome) ? `${(peerOutcome * 100).toFixed(1)}%` : "Not reported"}</strong></div>
              <div className="peer-line"><span>Difference</span><strong className={latestOutcome !== null && peerOutcome !== null && latestOutcome >= peerOutcome ? "positive" : "negative"}>{latestOutcome !== null && peerOutcome !== null && Number.isFinite(peerOutcome) ? `${((latestOutcome - peerOutcome) * 100).toFixed(1)} pts` : "—"}</strong></div>
              <p className="context-note">Use the comparison group as context, not a ranking. School type, population, and reporting coverage can affect interpretation.</p>
            </article>
          </div>
        </section>

        <footer><span>MDG School Lens</span><span>Source: NYC School Quality Reports Data</span></footer>
      </main>

      <section className="briefing-sheet" aria-hidden="true">
        <header><div><span className="briefing-mark">M</span><div><strong>MDG School Lens</strong><small>Leadership Briefing</small></div></div><p>Report year {year}<br />Prepared {new Date().toLocaleDateString()}</p></header>
        {briefingMode === "district" && <>
          <div className="briefing-heading"><p>District briefing</p><h1>Community School District {Number(selectedDistrict)}</h1><span>{DISTRICT_LABELS[selectedDistrict]}</span></div>
          <ExecutiveSummary observations={districtSummary()} />
          <div className="briefing-kpis"><div><span>Schools</span><strong>{districtSchools.length}</strong></div><div><span>District · {attendanceMeasureLabel}</span><strong>{districtAttendance === null ? "Not reported" : `${(districtAttendance * 100).toFixed(1)}%`}</strong></div><div><span>Citywide</span><strong>{citywideAttendanceMeasure === null ? "Not reported" : `${(citywideAttendanceMeasure * 100).toFixed(1)}%`}</strong></div><div><span>Difference</span><strong>{districtAttendance !== null && citywideAttendanceMeasure !== null ? `${((districtAttendance - citywideAttendanceMeasure) * 100).toFixed(1)} pts` : "Not reported"}</strong></div></div>
          <BriefingSignal signal={districtSignal} />
          <h2>School configuration</h2><div className="briefing-list">{districtTypeCounts.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value} schools</strong></div>)}</div>
        </>}
        {briefingMode === "comparison" && <>
          <div className="briefing-heading"><p>School comparison</p><h1>{comparedSchools.map((school) => school.school_name).join(" vs. ")}</h1><span>Side-by-side outcome context</span></div>
          <ExecutiveSummary observations={comparisonSummary()} />
          <div className="briefing-schools">{comparedSchools.map((school) => <article key={school.dbn}><h2>{school.school_name}</h2><p>{school.dbn} · {school.school_type} · District {Number(school.dbn.slice(0, 2))}</p>{OUTCOME_METRICS.map((metric) => { const result = briefingSnapshot(comparisonProfiles[school.dbn] || [], metric); return <div className="briefing-metric" key={metric.key}><span>{metric.label}</span><strong>{result.value === null ? "Not reported" : `${(result.value * 100).toFixed(1)}%`}</strong><SignalBadge signal={result.signal} /></div>; })}</article>)}</div>
        </>}
        {briefingMode === "profile" && <>
          <div className="briefing-heading"><p>School profile</p><h1>{selectedSchool?.school_name || "Selected school"}</h1><span>{selectedSchool?.dbn} · {selectedSchool?.school_type} · District {Number(selectedSchool?.dbn.slice(0, 2) || 0)}</span></div>
          <ExecutiveSummary observations={schoolSummary(profile, selectedSchool?.school_name || "The selected school")} />
          <div className="briefing-profile">{OUTCOME_METRICS.map((metric) => { const result = briefingSnapshot(profile, metric); return <article key={metric.key}><span>{metric.label}</span><strong>{result.value === null ? "Not reported" : `${(result.value * 100).toFixed(1)}%`}</strong><small>{result.peer === null ? "Peer not reported" : `Peer group ${(result.peer * 100).toFixed(1)}%`}</small><BriefingSignal signal={result.signal} /></article>; })}</div>
        </>}
        <div className="briefing-notes"><strong>Interpretation notes</strong><p>Signals describe individual metrics, not entire schools. Improving indicates a rise of at least 2 points; Needs Review indicates a decline of at least 2 points or a result at least 3 points below peers. Missing values may reflect non-applicable or suppressed data.</p></div>
        <footer><span>Source: NYC Open Data · School Quality Reports Data · dnpx-dfnc</span><span>mdg-school-lens.michael-goslin.chatgpt.site</span></footer>
      </section>
    </div>
  );
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function buildSignal(trend: number[], latest: number | null, peer: number | null, metric: string): Signal {
  const valid = trend.filter(Number.isFinite);
  const change = valid.length >= 2 ? valid.at(-1)! - valid[0] : null;
  const gap = latest !== null && peer !== null && Number.isFinite(peer) ? latest - peer : null;
  if (latest === null || (change === null && gap === null)) return { status: "insufficient", label: "Insufficient Data", reason: `${metric} does not have enough comparable information for a signal.` };
  if ((change !== null && change <= -.02) || (gap !== null && gap <= -.03)) {
    const reason = change !== null && change <= -.02 ? `${metric} declined ${Math.abs(change * 100).toFixed(1)} points across the reported trend.` : `${metric} is ${Math.abs((gap || 0) * 100).toFixed(1)} points below the peer group.`;
    return { status: "review", label: "Needs Review", reason };
  }
  if (change !== null && change >= .02) return { status: "improving", label: "Improving", reason: `${metric} improved ${(change * 100).toFixed(1)} points across the reported trend.` };
  const detail = gap !== null ? `${metric} is within ${Math.abs(gap * 100).toFixed(1)} points of the peer group.` : `${metric} changed less than 2 points across the reported trend.`;
  return { status: "stable", label: "Stable", reason: detail };
}

function SignalBadge({ signal }: { signal: Signal }) {
  return <span className={`signal-badge ${signal.status}`}><i />{signal.label}</span>;
}

function BriefingSignal({ signal }: { signal: Signal }) {
  return <div className={`briefing-signal ${signal.status}`}><strong>{signal.label}</strong><span>{signal.reason}</span></div>;
}

function ExecutiveSummary({ observations }: { observations: string[] }) {
  return <section className="executive-summary"><h2>Executive summary</h2><ol>{observations.map((observation, index) => <li key={`${index}-${observation}`}>{observation}</li>)}</ol></section>;
}
