import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api";
import JobCard from "../components/JobCard";
import StatusBadge from "../components/StatusBadge";

function prettyStatus(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function JobseekerDashboard() {
  const [items, setItems] = useState([]);
  const [applicationSummary, setApplicationSummary] = useState(null);
  const [matches, setMatches] = useState([]);
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [error, setError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recommendationsBusy, setRecommendationsBusy] = useState(false);

  async function loadCore() {
    setError("");

    try {
      const [apps, matchData, readinessData] = await Promise.all([
        api.get("/applications/mine/unified"),
        api.get("/auto-apply/matches"),
        api.get("/jobseeker-center/readiness")
      ]);

      setItems(apps.data.items || []);
      setApplicationSummary(apps.data.summary || null);
      setMatches(matchData.data.items || []);
      setSettings(matchData.data.settings || null);
      setSummary(matchData.data.summary || null);
      setReadiness(readinessData.data || null);
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  async function loadRecommendations() {
    setRecommendationError("");
    setRecommendationsBusy(true);

    try {
      const { data } = await api.get("/jobseeker-center/recommendations");
      setRecommendations(data.items || []);
      setRecommendationMessage(data.message || "");
    } catch (err) {
      setRecommendations([]);
      setRecommendationError(apiMessage(err));
    } finally {
      setRecommendationsBusy(false);
    }
  }

  useEffect(() => {
    loadCore();
    loadRecommendations();
  }, []);

  async function runAutoApply() {
    setBusy(true);
    setResult(null);
    setError("");

    try {
      const { data } = await api.post("/auto-apply/run");
      setResult(data.result);
      await loadCore();
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateExternalStatus(recordId, status) {
    setError("");

    try {
      await api.put(`/external-applications/${recordId}/status`, { status });
      await Promise.all([loadCore(), loadRecommendations()]);
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  function handleRecommendationAction(job, tracking) {
    setRecommendations((current) => current.map((item) =>
      item.externalId === job.externalId
        ? { ...item, tracking }
        : item
    ));

    void loadCore();
  }

  const applyQueue = items.filter(
    (item) => item.isExternal && ["saved", "ready_to_apply"].includes(item.status)
  );

  return (
    <>
      <section className="section-head">
        <div>
          <span className="eyebrow">JOBSEEKER CENTER</span>
          <h1>Matches, Alerts & Applications</h1>
          <p>
            HireHub Auto Apply handles native HireHub jobs. External jobs are
            matched, queued and tracked from the same dashboard.
          </p>
        </div>

        <div className="actions">
          <Link className="button secondary" to="/profile">Edit Setup</Link>
          <button
            className="button primary"
            onClick={runAutoApply}
            disabled={busy}
          >
            {busy ? "Checking..." : "Auto Apply Suitable HireHub Jobs"}
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="card profile-readiness-panel">
        <div className="table-title">
          <div>
            <span className="eyebrow">PROFILE READINESS</span>
            <h2>{readiness?.score ?? 0}% Complete</h2>
            <p className="muted">
              A complete profile improves matching and recommendation quality.
            </p>
          </div>
          <Link className="button ghost small" to="/profile">Improve Profile</Link>
        </div>

        <div className="readiness-progress" aria-label="Profile completeness">
          <span style={{ width: `${readiness?.score ?? 0}%` }} />
        </div>

        <div className="readiness-check-grid">
          {(readiness?.checks || []).map((item) => (
            <div className={`readiness-check ${item.ready ? "ready" : "missing"}`} key={item.key}>
              <span>{item.ready ? "✓" : "○"}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.weight}%</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="readiness-card">
        <div className="readiness-item">
          <span>Master Resume</span>
          <strong className={settings?.resumeUploaded ? "ok" : "no"}>
            {settings?.resumeUploaded ? "Ready" : "Missing"}
          </strong>
        </div>
        <div className="readiness-item">
          <span>HireHub Auto Apply</span>
          <strong className={settings?.autoApplyEnabled ? "ok" : "no"}>
            {settings?.autoApplyEnabled ? "ON" : "OFF"}
          </strong>
        </div>
        <div className="readiness-item">
          <span>Match Level</span>
          <strong>{settings?.minMatchScore ?? 70}%</strong>
        </div>
        <div className="readiness-item">
          <span>Eligible HireHub Jobs</span>
          <strong>{summary?.eligibleCount ?? 0}</strong>
        </div>
      </section>

      {result && (
        <div className={`diagnostic ${result.created ? "success" : "info"}`}>
          <div>
            <strong>{result.message}</strong>
            <p>
              Checked: {result.checked} · Eligible: {result.eligible} · Below Match Level: {result.belowRequirement} · Already applied: {result.alreadyApplied}
            </p>
          </div>

          {!result.created && (
            <div className="diagnostic-help">
              {result.reason === "resume_missing" && <Link to="/profile">Upload Master Resume →</Link>}
              {result.reason === "auto_apply_disabled" && <Link to="/profile">Enable Auto Apply →</Link>}
              {result.reason === "no_suitable_jobs" && <span>Broaden your roles/locations or adjust your Match Level.</span>}
              {result.reason === "all_already_applied" && <span>All current suitable HireHub jobs are already applied.</span>}
            </div>
          )}
        </div>
      )}

      <div className="application-center-metrics">
        <div className="metric"><span>HireHub Applications</span><strong>{applicationSummary?.hirehubApplications ?? 0}</strong></div>
        <div className="metric"><span>External Apply Queue</span><strong>{applicationSummary?.readyToApply ?? 0}</strong></div>
        <div className="metric"><span>Saved Jobs</span><strong>{applicationSummary?.saved ?? 0}</strong></div>
        <div className="metric"><span>Shortlisted</span><strong>{applicationSummary?.shortlisted ?? 0}</strong></div>
        <div className="metric"><span>Interview</span><strong>{applicationSummary?.interview ?? 0}</strong></div>
        <div className="metric"><span>Selected</span><strong>{applicationSummary?.selected ?? 0}</strong></div>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <div>
            <span className="eyebrow">SMART JOB ALERTS</span>
            <h2>Recommended External Jobs</h2>
            <p className="muted">
              Based on your preferred role, location, skills and HireHub match score.
            </p>
          </div>

          <button
            className="button ghost small"
            type="button"
            disabled={recommendationsBusy}
            onClick={loadRecommendations}
          >
            {recommendationsBusy ? "Refreshing..." : "Refresh Recommendations"}
          </button>
        </div>

        {recommendationError && (
          <div className="alert error">{recommendationError}</div>
        )}

        {recommendationsBusy && !recommendations.length ? (
          <div className="card centered">Finding recommendations...</div>
        ) : (
          <>
            <div className="jobs-grid">
              {recommendations.map((job) => (
                <JobCard
                  job={job}
                  key={`recommendation-${job.externalId || job.id}`}
                  onExternalAction={handleRecommendationAction}
                />
              ))}
            </div>

            {!recommendations.length && (
              <div className="card centered">
                {recommendationMessage || "No fresh external recommendations right now."}
              </div>
            )}
          </>
        )}
      </section>

      <section className="card table-card">
        <div className="table-title">
          <div>
            <span className="eyebrow">EXTERNAL APPLY QUEUE</span>
            <h2>Saved & Ready to Apply</h2>
            <p className="muted">
              Open the original platform, submit there, then mark the job as applied in HireHub.
            </p>
          </div>
          <span className="count-pill">{applyQueue.length} queued</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Platform</th>
                <th>Match</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applyQueue.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.jobTitle}</strong><br />
                    <small>{item.companyName} · {item.location}</small>
                  </td>
                  <td>{item.sourceLabel}</td>
                  <td><strong>{item.matchScore || 0}%</strong></td>
                  <td><StatusBadge value={item.status} /></td>
                  <td>
                    <div className="table-actions-inline">
                      <a
                        className="text-link"
                        href={item.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open ↗
                      </a>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => updateExternalStatus(item.recordId, "applied")}
                      >
                        Mark Applied
                      </button>
                      <button
                        className="link-button muted-action"
                        type="button"
                        onClick={() => updateExternalStatus(item.recordId, "skipped")}
                      >
                        Skip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!applyQueue.length && (
                <tr>
                  <td colSpan="5" className="empty">No external jobs waiting in your Apply Queue.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card match-board">
        <div className="table-title">
          <div>
            <h2>HireHub Match Scores</h2>
            <p className="muted">Native HireHub jobs continue to use the existing Auto Apply engine.</p>
          </div>
        </div>

        <div className="match-grid">
          {matches.map((item) => (
            <article className="match-card" key={item.job.id}>
              <div className="match-score">{item.match.score}%</div>
              <span className="eyebrow">{item.job.type}</span>
              <h3>{item.job.title}</h3>
              <p className="company">{item.job.companyName}</p>
              <p className="muted">📍 {item.job.location} · {item.job.experienceLevel}</p>

              <div className="score-list">
                <div><span>Skills</span><strong>{item.match.breakdown.skills}%</strong></div>
                <div><span>Role</span><strong>{item.match.breakdown.role}%</strong></div>
                <div><span>Location</span><strong>{item.match.breakdown.location}%</strong></div>
                <div><span>Job Type</span><strong>{item.match.breakdown.jobType}%</strong></div>
                <div><span>Experience</span><strong>{item.match.breakdown.experience}%</strong></div>
              </div>

              {item.application ? (
                <div className="application-note">
                  {item.application.applicationMethod === "auto" ? "AUTO APPLIED" : "MANUAL APPLIED"} · {item.application.status}
                </div>
              ) : item.eligible ? (
                <div className="application-note eligible">Meets Auto-Apply Level</div>
              ) : (
                <div className="application-note low">Below {settings?.minMatchScore || 70}% Match Level</div>
              )}

              <Link className="text-link" to={`/jobs/${item.job.id}`}>View job →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="card table-card">
        <div className="table-title">
          <div>
            <span className="eyebrow">UNIFIED TRACKER</span>
            <h2>All Application Activity</h2>
            <p className="muted">HireHub and external-platform activity in one history.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Platform</th>
                <th>Match</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.isExternal ? (
                      <a className="text-link" href={item.applyUrl} target="_blank" rel="noopener noreferrer">
                        {item.jobTitle} ↗
                      </a>
                    ) : (
                      <Link className="text-link" to={`/jobs/${item.job?.id}`}>
                        {item.jobTitle}
                      </Link>
                    )}
                    <br />
                    <small>{item.companyName}</small>
                  </td>
                  <td>{item.sourceLabel}</td>
                  <td><strong>{item.matchScore || 0}%</strong></td>
                  <td>
                    <span className={`method method-${item.applicationMethod}`}>
                      {item.applicationMethod}
                    </span>
                  </td>
                  <td>
                    {item.isExternal && !["saved", "ready_to_apply", "skipped"].includes(item.status) ? (
                      <select
                        value={item.status}
                        onChange={(event) => updateExternalStatus(item.recordId, event.target.value)}
                      >
                        {["applied", "shortlisted", "interview", "selected", "rejected"].map((status) => (
                          <option value={status} key={status}>{prettyStatus(status)}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <StatusBadge value={item.status} />
                        <small className="unified-status-text">{prettyStatus(item.status)}</small>
                      </>
                    )}
                  </td>
                  <td>
                    {new Date(item.appliedAt || item.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}

              {!items.length && (
                <tr><td colSpan="6" className="empty">No application activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
