import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiMessage } from "../api";
import StatusBadge from "../components/StatusBadge";

const appStatuses = ["applied", "reviewing", "shortlisted", "interview", "selected", "rejected", "hired"];

export default function EmployerJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const { data } = await api.get(`/applications/job/${id}`);
      setJob(data.job);
      setItems(data.items);
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  useEffect(() => { load(); }, [id]);

  async function updateStatus(appId, status) {
    try {
      await api.put(`/applications/${appId}/status`, { status });
      await load();
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  async function downloadResume(item) {
    try {
      const response = await api.get(`/applications/${item.id}/resume`, {
        responseType: "blob"
      });

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.originalResumeName || "resume";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  async function deleteJob() {
    if (!confirm("Delete this job? Jobs with applications cannot be deleted.")) return;
    try {
      await api.delete(`/jobs/${id}`);
      navigate("/employer");
    } catch (err) {
      setError(apiMessage(err));
    }
  }

  return (
    <>
      <section className="section-head">
        <div>
          <span className="eyebrow">JOB MANAGEMENT</span>
          <h1>{job?.title || "Loading..."}</h1>
          {job && <p>{job.location} · <StatusBadge value={job.status} /></p>}
        </div>
        <div className="actions">
          <Link className="button secondary" to={`/employer/jobs/${id}/edit`}>Edit Job</Link>
          <button className="button danger" onClick={deleteJob}>Delete</button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="card table-card">
        <div className="table-title">
          <div><h2>Applicants</h2><p className="muted">Review profiles, resumes and update status.</p></div>
          <span className="count-pill">{items.length} candidate(s)</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Candidate</th><th>Match</th><th>Method</th><th>Skills</th><th>Resume</th><th>Status</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.jobseeker?.name}</strong><br />
                    <small>{item.jobseeker?.email}</small>
                  </td>
                  <td><strong>{item.matchScore || 0}%</strong></td>
                  <td><span className={`method method-${item.applicationMethod}`}>{item.applicationMethod}</span></td>
                  <td>{item.jobseeker?.jobseekerProfile?.skills?.join(", ") || "—"}</td>
                  <td>
                    <button className="link-button" type="button" onClick={() => downloadResume(item)}>
                      Download
                    </button>
                  </td>
                  <td>
                    <select value={item.status} onChange={(e) => updateStatus(item.id, e.target.value)}>
                      {appStatuses.map((s) => <option value={s} key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan="6" className="empty">No applicants yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
