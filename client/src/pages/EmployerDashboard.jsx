import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api";
import JobCard from "../components/JobCard";

const APPLICATION_STATUSES = [
  "applied",
  "reviewing",
  "shortlisted",
  "interview",
  "selected",
  "rejected",
  "hired"
];

export default function EmployerDashboard() {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setError("");
    setLoading(true);

    try {
      const [jobsResponse, applicationsResponse] = await Promise.all([
        api.get("/jobs/employer/mine"),
        api.get("/applications/employer/mine")
      ]);

      setJobs(jobsResponse.data.items);
      setApplications(applicationsResponse.data.items);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(applicationId, status) {
    setError("");
    setMessage("");

    try {
      const { data } = await api.put(
        `/applications/${applicationId}/status`,
        { status }
      );

      setMessage(
        data.message || "Candidate application updated successfully."
      );

      await load();
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  async function viewResume(item) {
    setError("");

    const previewWindow = window.open("", "_blank");

    if (!previewWindow) {
      setError(
        "Resume preview was blocked by the browser. Please allow popups for HireHub and try again."
      );
      return;
    }

    try {
      previewWindow.document.title = "HireHub - Resume Preview";
      previewWindow.document.body.innerHTML = "";

      const loading = previewWindow.document.createElement("div");
      loading.textContent = "Loading candidate resume...";
      loading.style.cssText =
        "min-height:90vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#475569;background:#fff7ed;";
      previewWindow.document.body.appendChild(loading);

      const response = await api.get(
        `/applications/${item.id}/resume/preview`,
        { responseType: "blob" }
      );

      const contentType = String(
        response.headers?.["content-type"] ||
        response.data?.type ||
        ""
      ).toLowerCase();

      if (contentType.includes("application/pdf")) {
        const pdfBlob =
          response.data instanceof Blob
            ? response.data
            : new Blob([response.data], {
                type: "application/pdf"
              });

        const pdfUrl = URL.createObjectURL(pdfBlob);
        previewWindow.location.replace(pdfUrl);

        window.setTimeout(() => {
          URL.revokeObjectURL(pdfUrl);
        }, 5 * 60 * 1000);

        return;
      }

      const resumeText = await response.data.text();

      previewWindow.document.open();
      previewWindow.document.write(
        `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>HireHub - Resume Preview</title>
          </head>
          <body></body>
        </html>`
      );
      previewWindow.document.close();

      const body = previewWindow.document.body;
      body.style.cssText =
        "margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033;";

      const shell = previewWindow.document.createElement("main");
      shell.style.cssText =
        "max-width:900px;margin:32px auto;padding:32px;background:white;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.10);";

      const heading = previewWindow.document.createElement("h2");
      heading.textContent = item.originalResumeName || "Candidate Resume";
      heading.style.cssText =
        "margin:0 0 22px;color:#c2410c;font-size:22px;";

      const pre = previewWindow.document.createElement("pre");
      pre.textContent = resumeText || "No readable text was found in this resume.";
      pre.style.cssText =
        "margin:0;white-space:pre-wrap;word-break:break-word;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#334155;";

      shell.appendChild(heading);
      shell.appendChild(pre);
      body.appendChild(shell);
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }

      setError(apiMessage(err));
    }
  }

  const activeJobs = jobs.filter(
    (job) => job.status === "active"
  ).length;

  const shortlisted = applications.filter(
    (item) => item.status === "shortlisted"
  ).length;

  const interview = applications.filter(
    (item) => item.status === "interview"
  ).length;

  const selected = applications.filter(
    (item) => ["selected", "hired"].includes(item.status)
  ).length;

  return (
    <>
      {message && (
        <div className="app-toast success">{message}</div>
      )}

      <section className="section-head">
        <div>
          <span className="eyebrow">RECRUITER DASHBOARD</span>
          <h1>Jobs & Candidate Applications</h1>
          <p>
            Recruiters and job providers can publish openings, review
            candidates who applied to their own jobs, view resumes and
            manage hiring status.
          </p>
        </div>

        <Link className="button primary" to="/employer/jobs/new">
          + Post a Job
        </Link>
      </section>

      {error && <div className="alert error">{error}</div>}

      <div className="metrics-row four">
        <div className="metric">
          <span>Total Jobs</span>
          <strong>{jobs.length}</strong>
        </div>

        <div className="metric">
          <span>Active Jobs</span>
          <strong>{activeJobs}</strong>
        </div>

        <div className="metric">
          <span>Applications Received</span>
          <strong>{applications.length}</strong>
        </div>

        <div className="metric">
          <span>Shortlisted / Selected</span>
          <strong>{shortlisted} / {selected}</strong>
        </div>
      </div>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <div>
            <span className="eyebrow">YOUR OPENINGS</span>
            <h2>Posted Jobs</h2>
          </div>
        </div>

        {loading ? (
          <div className="card centered">Loading recruiter data...</div>
        ) : (
          <>
            <div className="jobs-grid">
              {jobs.map((job) => (
                <JobCard
                  job={job}
                  employerMode
                  key={job.id}
                />
              ))}
            </div>

            {!jobs.length && (
              <div className="card centered">
                No jobs yet. Post your first opening.
              </div>
            )}
          </>
        )}
      </section>

      <div className="recruiter-pipeline">
        <span>Applied <strong>{applications.filter((item) => item.status === "applied").length}</strong></span>
        <span>Reviewing <strong>{applications.filter((item) => item.status === "reviewing").length}</strong></span>
        <span>Shortlisted <strong>{shortlisted}</strong></span>
        <span>Interview <strong>{interview}</strong></span>
        <span>Selected <strong>{selected}</strong></span>
        <span>Rejected <strong>{applications.filter((item) => item.status === "rejected").length}</strong></span>
      </div>

      <section className="card table-card recruiter-applications">
        <div className="table-title">
          <div>
            <span className="eyebrow">CANDIDATES</span>
            <h2>Applications Received</h2>
            <p className="muted">
              Only applications submitted to jobs owned by this recruiter
              account are shown here.
            </p>
          </div>

          <span className="count-pill">
            {applications.length} application(s)
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Match</th>
                <th>Method</th>
                <th>Skills</th>
                <th>Resume</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {applications.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.jobseeker?.name || "Candidate"}</strong>
                    <br />
                    <small>{item.jobseeker?.email || ""}</small>
                  </td>

                  <td>
                    <Link
                      className="text-link"
                      to={`/employer/jobs/${item.job?.id}`}
                    >
                      {item.job?.title || "Job"}
                    </Link>
                  </td>

                  <td>
                    <strong>{item.matchScore || 0}%</strong>
                  </td>

                  <td>
                    <span
                      className={`method method-${item.applicationMethod}`}
                    >
                      {item.applicationMethod}
                    </span>
                  </td>

                  <td>
                    {item.jobseeker?.jobseekerProfile?.skills?.join(", ") ||
                      "—"}
                  </td>

                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => viewResume(item)}
                    >
                      View
                    </button>
                  </td>

                  <td>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateStatus(item.id, e.target.value)
                      }
                    >
                      {APPLICATION_STATUSES.map((status) => (
                        <option value={status} key={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}

              {!applications.length && (
                <tr>
                  <td colSpan="7" className="empty">
                    No candidate applications have been received yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}