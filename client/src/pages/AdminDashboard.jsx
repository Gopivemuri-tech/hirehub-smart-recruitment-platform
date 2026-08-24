import { useEffect, useState } from "react";
import { api, apiMessage } from "../api";
import StatusBadge from "../components/StatusBadge";

function roleLabel(role) {
  if (role === "admin") return "Platform Owner";
  if (role === "employer") return "Recruiter / Job Provider";
  if (role === "jobseeker") return "Candidate / Jobseeker";
  return role;
}

function pretty(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [tab, setTab] = useState("analytics");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");

    try {
      const [statsResponse, analyticsResponse, usersResponse, jobsResponse] =
        await Promise.all([
          api.get("/admin/stats"),
          api.get("/admin/analytics"),
          api.get("/admin/users"),
          api.get("/admin/jobs")
        ]);

      setStats(statsResponse.data);
      setAnalytics(analyticsResponse.data);
      setUsers(usersResponse.data.items || []);
      setJobs(jobsResponse.data.items || []);
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleUser(id, role) {
    setError("");
    setMessage("");

    try {
      const { data } = await api.put(
        `/admin/users/${role}/${id}/toggle-active`
      );

      setMessage(data.message || "User account updated successfully.");
      await load();
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  async function setJobStatus(id, status) {
    setError("");
    setMessage("");

    try {
      const { data } = await api.put(
        `/admin/jobs/${id}/status`,
        { status }
      );

      setMessage(data.message || "Job moderation status updated successfully.");
      await load();
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  return (
    <>
      {message && <div className="app-toast success">{message}</div>}

      <section className="section-head">
        <div>
          <span className="eyebrow">PLATFORM OWNER</span>
          <h1>HireHub Administration</h1>
          <p>
            Monitor users, native jobs, application pipeline and external job-source activity.
            Recruiter hiring decisions remain with the recruiter who posted the HireHub job.
          </p>
        </div>
      </section>

      {stats && (
        <div className="admin-metrics">
          {[
            ["Total Users", stats.users],
            ["Candidates", stats.jobseekers],
            ["Recruiters", stats.employers],
            ["Total Jobs", stats.jobs],
            ["HireHub Applications", stats.applications],
            ["External Tracked", stats.externalTracked]
          ].map(([label, value]) => (
            <div className="metric" key={label}>
              <span>{label}</span>
              <strong>{value ?? 0}</strong>
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <div className="tabs">
        <button
          className={tab === "analytics" ? "tab active" : "tab"}
          onClick={() => setTab("analytics")}
        >
          Analytics
        </button>
        <button
          className={tab === "users" ? "tab active" : "tab"}
          onClick={() => setTab("users")}
        >
          Users & Roles
        </button>
        <button
          className={tab === "jobs" ? "tab active" : "tab"}
          onClick={() => setTab("jobs")}
        >
          Job Moderation
        </button>
      </div>

      {tab === "analytics" && (
        <>
          <section className="card table-card">
            <div className="table-title">
              <div>
                <span className="eyebrow">APPLICATION PIPELINE</span>
                <h2>Candidate Progress</h2>
                <p className="muted">Combined native HireHub and tracked external activity.</p>
              </div>
            </div>

            <div className="application-center-metrics">
              {["applied", "reviewing", "shortlisted", "interview", "selected", "hired", "rejected"].map((status) => (
                <div className="metric" key={status}>
                  <span>{pretty(status)}</span>
                  <strong>{analytics?.pipeline?.[status] ?? 0}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card table-card">
            <div className="table-title">
              <div>
                <span className="eyebrow">SOURCE PERFORMANCE</span>
                <h2>Application Activity by Platform</h2>
                <p className="muted">
                  External platforms show tracked user activity; HireHub shows actual native applications.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Platform</th>
                    <th>Tracked</th>
                    <th>Applied</th>
                    <th>Shortlisted</th>
                    <th>Interview</th>
                    <th>Selected</th>
                    <th>Rejected</th>
                    <th>Avg Match</th>
                    <th>Apply Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.sourcePerformance || []).map((item) => (
                    <tr key={item.source}>
                      <td><strong>{item.label}</strong></td>
                      <td>{item.tracked}</td>
                      <td>{item.applied}</td>
                      <td>{item.shortlisted}</td>
                      <td>{item.interview}</td>
                      <td>{item.selected}</td>
                      <td>{item.rejected}</td>
                      <td>{item.averageMatch}%</td>
                      <td>{item.conversionRate}%</td>
                    </tr>
                  ))}

                  {!analytics?.sourcePerformance?.length && (
                    <tr><td colSpan="9" className="empty">No application analytics yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "users" && (
        <section className="card table-card">
          <div className="table-title">
            <div>
              <h2>Platform Users</h2>
              <p className="muted">
                Admin is the platform owner. Employers are recruiters/job providers.
                Jobseekers are candidates/students.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Platform Role</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={`${user.role}-${user.id}`}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td><StatusBadge value={user.isActive ? "active" : "disabled"} /></td>
                    <td>
                      {user.role !== "admin" ? (
                        <button
                          className="button ghost small"
                          onClick={() => toggleUser(user.id, user.role)}
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                      ) : (
                        <span className="muted">Owner account</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "jobs" && (
        <section className="card table-card">
          <div className="table-title">
            <div>
              <h2>Job Moderation</h2>
              <p className="muted">
                Platform administration can open or close HireHub listings.
                Applicant review and hiring decisions are handled by the recruiter.
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Recruiter / Company</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Moderate</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.title}</td>
                    <td>
                      {job.companyName ||
                        job.employer?.employerProfile?.companyName ||
                        job.employer?.name}
                    </td>
                    <td>{job.type}</td>
                    <td><StatusBadge value={job.status} /></td>
                    <td>
                      <select
                        value={job.status}
                        onChange={(event) => setJobStatus(job.id, event.target.value)}
                      >
                        <option value="active">active</option>
                        <option value="closed">closed</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
