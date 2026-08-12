"use client";

import { useEffect, useMemo, useState } from "react";

const API = "https://data.cityofnewyork.us/resource/dnpx-dfnc.json";
const DISTRICT_LABELS: Record<string, string> = {
  "01":"Manhattan · Lower East Side / East Village", "02":"Manhattan · Lower Manhattan / Midtown / Upper East Side", "03":"Manhattan · Upper West Side / West Harlem", "04":"Manhattan · East Harlem", "05":"Manhattan · Central Harlem / Morningside Heights", "06":"Manhattan · Washington Heights / Inwood",
  "07":"Bronx · Mott Haven / Port Morris", "08":"Bronx · Hunts Point / Soundview / Throgs Neck", "09":"Bronx · Morrisania / Highbridge", "10":"Bronx · Riverdale / Fordham / Kingsbridge", "11":"Bronx · Northeast Bronx / Co-op City", "12":"Bronx · East Tremont / Crotona Park",
  "13":"Brooklyn · Downtown / Fort Greene / Brooklyn Heights", "14":"Brooklyn · Williamsburg / Greenpoint", "15":"Brooklyn · Park Slope / Sunset Park / Red Hook", "16":"Brooklyn · Bedford-Stuyvesant", "17":"Brooklyn · Crown Heights / East Flatbush", "18":"Brooklyn · Canarsie / East Flatbush", "19":"Brooklyn · East New York", "20":"Brooklyn · Bay Ridge / Bensonhurst", "21":"Brooklyn · Coney Island / Brighton Beach", "22":"Brooklyn · Flatbush / Marine Park", "23":"Brooklyn · Brownsville / Ocean Hill", "24":"Queens · Corona / Elmhurst / Ridgewood", "25":"Queens · Flushing / Whitestone", "26":"Queens · Bayside / Fresh Meadows", "27":"Queens · Far Rockaway / Howard Beach", "28":"Queens · Jamaica / Forest Hills", "29":"Queens · Southeast Queens", "30":"Queens · Astoria / Long Island City / Jackson Heights", "31":"Staten Island · Boroughwide", "32":"Brooklyn · Bushwick",
};

type YearRow = { report_year: string; schools: string; records: string };
type TypeRow = { school_type: string; schools: string };
type MetricRow = { metric_variable_name: string; metric_display_name: string; metric_value: string };
type SchoolRow = { dbn: string; school_name: string; school_type: string };
type ProfileRow = MetricRow & { report_year: string; comparison_group_average?: string; number_of_students?: string };
type DistrictMetricRow = SchoolRow & { metric_value: string };

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
        "$select": "dbn,school_name,school_type,metric_value",
        "$where": `${where} and metric_variable_name in('attendance_hs_all','attendance_k3_all','attendance_k8_all')`,
        "$limit": "5000",
      }),
    ]).then(([typeData, metricData, schoolData, districtMetricData]) => {
      setTypes(typeData as TypeRow[]);
      setMetrics(metricData as MetricRow[]);
      const availableSchools = schoolData as SchoolRow[];
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
    const variables = "'attendance_hs_all','attendance_k3_all','attendance_k8_all','chronic_absent_all','chronic_absent_ems_all','chronic_absent_hs_all'";
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
      "$where": `dbn='${dbn}' and metric_variable_name in('attendance_hs_all','attendance_k3_all','attendance_k8_all')`,
      "$order": "report_year",
      "$limit": "100",
    }).then((rows: ProfileRow[]) => [dbn, rows] as const)))
      .then((entries) => setComparisonProfiles(Object.fromEntries(entries)))
      .catch(() => setComparisonProfiles({}))
      .finally(() => setComparisonLoading(false));
  }, [compareDbns]);

  const current = years.find((item) => item.report_year === year);
  const attendance = useMemo(() => percent(metrics, ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"]), [metrics]);
  const strongAttendance = useMemo(() => percent(metrics, ["chronic_absent_all", "chronic_absent_ems_all", "chronic_absent_hs_all"]), [metrics]);
  const maxSchools = Math.max(...types.map((item) => Number(item.schools)), 1);
  const selectedSchool = schools.find((school) => school.dbn === selectedDbn);
  const schoolOptions = useMemo(() => schools.filter((school) => `${school.school_name} ${school.dbn}`.toLowerCase().includes(schoolSearch.toLowerCase().split(" · ")[0])).slice(0, 8), [schools, schoolSearch]);
  const attendanceTrend = useMemo(() => {
    const attendanceNames = ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"];
    return years.slice().reverse().map((item) => {
      const rows = profile.filter((row) => row.report_year === item.report_year && attendanceNames.includes(row.metric_variable_name));
      const value = rows.length ? Number(rows[0].metric_value) : null;
      return { year: item.report_year, value: value !== null && Number.isFinite(value) ? value : null };
    }).filter((item) => item.value !== null);
  }, [profile, years]);
  const latestAttendance = attendanceTrend.find((item) => item.year === year)?.value ?? attendanceTrend.at(-1)?.value ?? null;
  const latestProfileRow = profile.find((row) => row.report_year === year && ["attendance_hs_all", "attendance_k3_all", "attendance_k8_all"].includes(row.metric_variable_name));
  const peerAttendance = latestProfileRow?.comparison_group_average ? Number(latestProfileRow.comparison_group_average) : null;
  const districts = useMemo(() => Array.from(new Set(schools.map((school) => school.dbn.slice(0, 2)).filter((district) => /^\d{2}$/.test(district)))).sort(), [schools]);
  const districtSchools = useMemo(() => schools.filter((school) => school.dbn.startsWith(selectedDistrict)), [schools, selectedDistrict]);
  const districtAttendanceRows = useMemo(() => districtMetrics.filter((row) => row.dbn.startsWith(selectedDistrict) && Number.isFinite(Number(row.metric_value))), [districtMetrics, selectedDistrict]);
  const districtAttendance = districtAttendanceRows.length ? districtAttendanceRows.reduce((sum, row) => sum + Number(row.metric_value), 0) / districtAttendanceRows.length : null;
  const districtTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    districtSchools.forEach((school) => counts.set(school.school_type || "Unclassified", (counts.get(school.school_type || "Unclassified") || 0) + 1));
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [districtSchools]);
  const districtSchoolSignals = useMemo(() => districtAttendanceRows.slice().sort((a, b) => Number(b.metric_value) - Number(a.metric_value)), [districtAttendanceRows]);
  const comparedSchools = compareDbns.map((dbn) => schools.find((school) => school.dbn === dbn)).filter((school): school is SchoolRow => Boolean(school));

  function comparisonSnapshot(dbn: string) {
    const rows = comparisonProfiles[dbn] || [];
    const latest = rows.find((row) => row.report_year === year) || rows.at(-1);
    const value = latest && Number.isFinite(Number(latest.metric_value)) ? Number(latest.metric_value) : null;
    const peer = latest?.comparison_group_average && Number.isFinite(Number(latest.comparison_group_average)) ? Number(latest.comparison_group_average) : null;
    const trend = years.slice().reverse().map((item) => ({ year: item.report_year, row: rows.find((row) => row.report_year === item.report_year) })).filter((item) => item.row && Number.isFinite(Number(item.row.metric_value)));
    return { value, peer, trend, reportedYear: latest?.report_year || "—", students: latest?.number_of_students || "—" };
  }

  function openSchoolProfile(school: SchoolRow) {
    setSelectedDbn(school.dbn);
    setSchoolSearch(`${school.school_name} · ${school.dbn}`);
    window.setTimeout(() => document.getElementById("profiles")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

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
            <div className="focus-item"><span>01</span><div><strong>Review attendance context</strong><p>Compare school results with peer groups before escalating support.</p></div></div>
            <div className="focus-item"><span>02</span><div><strong>Check reporting coverage</strong><p>Missing values may indicate suppression or non-applicable measures.</p></div></div>
            <div className="focus-item"><span>03</span><div><strong>Move from signal to profile</strong><p>Use the next build to drill into individual schools and trends.</p></div></div>
          </article>
        </section>

        <section className="district-section" id="districts">
          <div className="profile-title district-title">
            <div><p className="eyebrow">Geographic intelligence</p><h2>District Explorer</h2><p>Review district coverage, attendance context, school mix, and schools that warrant a closer look.</p></div>
            <label className="district-select">Community school district
              <select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} aria-label="Community school district">
                {districts.map((district) => <option value={district} key={district}>District {Number(district)} — {DISTRICT_LABELS[district]}</option>)}
              </select>
            </label>
          </div>

          <div className="district-banner">
            <div><span>NYCPS</span><h3>Community School District {Number(selectedDistrict)}</h3><p>{DISTRICT_LABELS[selectedDistrict]} · {year} School Quality Reports</p></div>
            <div className="district-summary"><strong>{districtSchools.length}</strong><span>schools represented</span></div>
          </div>

          <div className="district-kpis">
            <article><p>District attendance</p><strong>{districtAttendance === null ? "—" : `${(districtAttendance * 100).toFixed(1)}%`}</strong><small>Average across reporting schools</small></article>
            <article><p>Citywide attendance</p><strong>{attendance === null ? "—" : `${(attendance * 100).toFixed(1)}%`}</strong><small>Same report year</small></article>
            <article><p>District difference</p><strong className={districtAttendance !== null && attendance !== null && districtAttendance >= attendance ? "positive" : "negative"}>{districtAttendance !== null && attendance !== null ? `${((districtAttendance - attendance) * 100).toFixed(1)} pts` : "—"}</strong><small>District versus citywide</small></article>
            <article><p>School types</p><strong>{districtTypeCounts.length}</strong><small>Reported configurations</small></article>
          </div>

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
            <div><p className="eyebrow">Side-by-side intelligence</p><h2>School Comparison</h2><p>Compare two schools across attendance, peer context, coverage, and reporting history.</p></div>
          </div>
          <div className="compare-selectors">
            {([0, 1] as const).map((position) => <label key={position}>School {position + 1}
              <select value={compareDbns[position]} onChange={(event) => setCompareDbns((current) => position === 0 ? [event.target.value, current[1]] : [current[0], event.target.value])}>
                {schools.map((school) => <option value={school.dbn} key={`${position}-${school.dbn}`}>{school.school_name} · {school.dbn}</option>)}
              </select>
            </label>)}
          </div>

          <div className="comparison-board">
            {comparedSchools.map((school, index) => {
              const snapshot = comparisonSnapshot(school.dbn);
              return <article className={`comparison-card school-${index + 1}`} key={school.dbn}>
                <div className="comparison-card-head"><span>{school.dbn}</span><div><h3>{school.school_name}</h3><p>{school.school_type} · District {Number(school.dbn.slice(0, 2))}</p></div><button onClick={() => openSchoolProfile(school)}>Open profile</button></div>
                <div className="comparison-metrics">
                  <div><span>Attendance</span><strong>{snapshot.value === null ? "—" : `${(snapshot.value * 100).toFixed(1)}%`}</strong></div>
                  <div><span>Peer group</span><strong>{snapshot.peer === null ? "—" : `${(snapshot.peer * 100).toFixed(1)}%`}</strong></div>
                  <div><span>Peer difference</span><strong className={snapshot.value !== null && snapshot.peer !== null && snapshot.value >= snapshot.peer ? "positive" : "negative"}>{snapshot.value !== null && snapshot.peer !== null ? `${((snapshot.value - snapshot.peer) * 100).toFixed(1)} pts` : "—"}</strong></div>
                  <div><span>Students represented</span><strong>{snapshot.students}</strong></div>
                </div>
                <div className="mini-trend">
                  <div className="mini-trend-head"><span>Multi-year attendance</span><small>{snapshot.trend.length} years reported</small></div>
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
            <div><p className="eyebrow">School intelligence</p><h2>School profile</h2><p>Find a school and review its multi-year attendance signal against the official peer group.</p></div>
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

          <div className="profile-grid">
            <article className="panel trend-panel">
              <div className="panel-head"><div><p className="eyebrow">Longitudinal view</p><h3>Average student attendance</h3></div><span>{attendanceTrend.length} years reported</span></div>
              {profileLoading ? <p className="muted">Loading school history…</p> : attendanceTrend.length ? <div className="trend-chart" aria-label="Attendance trend by year">
                {attendanceTrend.map((point) => <div className="trend-column" key={point.year} title={`${point.year}: ${((point.value || 0) * 100).toFixed(1)}%`}><span>{((point.value || 0) * 100).toFixed(0)}%</span><div><i style={{ height: `${Math.max(8, ((point.value || 0) - .7) * 300)}%` }} /></div><small>{point.year.slice(-2)}</small></div>)}
              </div> : <p className="muted">No attendance history is reported for this school.</p>}
            </article>

            <article className="panel peer-panel">
              <div className="panel-head"><div><p className="eyebrow">Context matters</p><h3>Peer comparison</h3></div><span>{year}</span></div>
              <div className="comparison-score"><strong>{latestAttendance === null ? "—" : `${(latestAttendance * 100).toFixed(1)}%`}</strong><span>School attendance</span></div>
              <div className="peer-line"><span>Comparison group</span><strong>{peerAttendance !== null && Number.isFinite(peerAttendance) ? `${(peerAttendance * 100).toFixed(1)}%` : "Not reported"}</strong></div>
              <div className="peer-line"><span>Difference</span><strong className={latestAttendance !== null && peerAttendance !== null && latestAttendance >= peerAttendance ? "positive" : "negative"}>{latestAttendance !== null && peerAttendance !== null && Number.isFinite(peerAttendance) ? `${((latestAttendance - peerAttendance) * 100).toFixed(1)} pts` : "—"}</strong></div>
              <p className="context-note">Use the comparison group as context, not a ranking. School type, population, and reporting coverage can affect interpretation.</p>
            </article>
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
