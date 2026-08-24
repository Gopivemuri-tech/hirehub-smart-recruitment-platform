import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiMessage } from "../api";

const empty = {
  title: "",
  description: "",
  location: "",
  skills: "",
  type: "Full-time",
  experienceLevel: "Fresher",
  salaryMin: "",
  salaryMax: "",
  status: "active"
};

export default function JobForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;

    api.get(`/jobs/${id}`).then(({ data }) => {
      const job = data.job;
      setForm({
        title: job.title,
        description: job.description,
        location: job.location,
        skills: (job.skills || []).join(", "),
        type: job.type,
        experienceLevel: job.experienceLevel || "Fresher",
        salaryMin: job.salaryRange?.min || "",
        salaryMax: job.salaryRange?.max || "",
        status: job.status
      });
    }).catch((err) => setError(apiMessage(err)));
  }, [id, editing]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (editing) {
        await api.put(`/jobs/${id}`, form);
        navigate(`/employer/jobs/${id}`);
      } else {
        const { data } = await api.post("/jobs", form);
        navigate(`/employer/jobs/${data.job.id}`);
      }
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-shell">
      <form className="card form-card" onSubmit={submit}>
        <span className="eyebrow">{editing ? "EDIT JOB" : "NEW OPENING"}</span>
        <h1>{editing ? "Update Job" : "Post a Job"}</h1>

        {error && <div className="alert error">{error}</div>}

        <div className="grid-2">
          <label><span>Job Title</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label><span>Location</span>
            <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label><span>Job Type</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {["Full-time","Part-time","Internship","Contract","Remote"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label><span>Experience Required</span>
            <select value={form.experienceLevel} onChange={(e) => setForm({ ...form, experienceLevel: e.target.value })}>
              {["Fresher","0-1 years","1-3 years","3+ years"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          {editing && (
            <label><span>Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          )}
          <label><span>Salary Min</span>
            <input type="number" min="0" value={form.salaryMin}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} />
          </label>
          <label><span>Salary Max</span>
            <input type="number" min="0" value={form.salaryMax}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} />
          </label>
        </div>

        <label><span>Skills (comma separated)</span>
          <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
            placeholder="React, Node.js, MySQL" />
        </label>

        <label><span>Description</span>
          <textarea rows="10" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>

        <button className="button primary" disabled={busy}>
          {busy ? "Saving..." : editing ? "Save Changes" : "Publish Job"}
        </button>
      </form>
    </section>
  );
}
