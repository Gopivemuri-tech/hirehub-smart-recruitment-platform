import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api";
import { useAuth } from "../context/AuthContext";

const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract", "Remote"];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState(null);
  const [resume, setResume] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role === "jobseeker") {
      const p = user.jobseekerProfile || {};
      setForm({
        name: user.name || "",
        skills: (p.skills || []).join(", "),
        experienceLevel: p.experienceLevel || "Fresher",
        preferredRoles: (p.preferredRoles || []).join(", "),
        preferredLocations: (p.preferredLocations || []).join(", "),
        preferredJobTypes: p.preferredJobTypes || [],
        autoApplyEnabled: Boolean(p.autoApplyEnabled),
        minMatchScore: Number(p.minMatchScore || 75),
        maxAutoApplicationsPerDay: Number(p.maxAutoApplicationsPerDay || 10),
        resumeUploaded: Boolean(p.resumeUploaded),
        originalResumeName: p.originalResumeName || "",
        headline: p.headline || "",
        location: p.location || "",
        bio: p.bio || ""
      });
    } else if (user.role === "employer") {
      setForm({
        name: user.name || "",
        companyName: user.employerProfile?.companyName || "",
        companyWebsite: user.employerProfile?.companyWebsite || "",
        companyDescription: user.employerProfile?.companyDescription || ""
      });
    } else setForm({ name: user.name || "" });
  }, [user]);

  const setupReady = useMemo(() => {
    if (!form || user?.role !== "jobseeker") return false;
    return Boolean(form.resumeUploaded && form.skills.trim() && form.preferredRoles.trim() &&
      form.preferredLocations.trim() && form.preferredJobTypes.length && form.autoApplyEnabled);
  }, [form, user?.role]);

  if (!form) return null;

  function toggleJobType(type) {
    setForm({ ...form, preferredJobTypes: form.preferredJobTypes.includes(type)
      ? form.preferredJobTypes.filter((x) => x !== type)
      : [...form.preferredJobTypes, type] });
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true); setMessage({ type: "", text: "" });
    let payload = { name: form.name };

    if (user.role === "jobseeker") {
      payload.jobseekerProfile = {
        headline: form.headline, location: form.location, skills: form.skills, bio: form.bio,
        experienceLevel: form.experienceLevel, preferredRoles: form.preferredRoles,
        preferredLocations: form.preferredLocations, preferredJobTypes: form.preferredJobTypes,
        autoApplyEnabled: form.autoApplyEnabled, minMatchScore: form.minMatchScore,
        maxAutoApplicationsPerDay: form.maxAutoApplicationsPerDay
      };
    } else if (user.role === "employer") {
      payload.employerProfile = {
        companyName: form.companyName, companyWebsite: form.companyWebsite,
        companyDescription: form.companyDescription
      };
    }

    try {
      const { data } = await api.put("/auth/profile", payload);
      updateUser(data.user);
      setMessage({
        type: "success",
        text: data.message || "Your details have been updated successfully."
      });
    } catch (err) { setMessage({ type: "error", text: apiMessage(err) }); }
    finally { setBusy(false); }
  }

  async function viewMasterResume() {
    setMessage({ type: "", text: "" });

    const previewWindow = window.open("", "_blank");

    if (!previewWindow) {
      setMessage({
        type: "error",
        text: "Resume preview was blocked. Allow popups for HireHub and try again."
      });
      return;
    }

    try {
      previewWindow.document.title = "HireHub - Master Resume";
      previewWindow.document.body.innerHTML = "";

      const loading = previewWindow.document.createElement("div");
      loading.textContent = "Loading Master Resume...";
      loading.style.cssText =
        "min-height:90vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#475569;background:#fff7ed;";
      previewWindow.document.body.appendChild(loading);

      const response = await api.get(
        "/auth/resume/preview",
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
            <title>HireHub - Master Resume</title>
          </head>
          <body></body>
        </html>`
      );
      previewWindow.document.close();

      const body = previewWindow.document.body;
      body.style.cssText =
        "margin:0;background:#fff7ed;font-family:Arial,sans-serif;color:#172033;padding:18px;";

      const shell = previewWindow.document.createElement("main");
      shell.style.cssText =
        "max-width:900px;margin:20px auto;padding:32px;background:rgba(255,255,255,.95);border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.10);";

      const heading = previewWindow.document.createElement("h2");
      heading.textContent = form.originalResumeName || "Master Resume";
      heading.style.cssText =
        "margin:0 0 22px;color:#c2410c;font-size:22px;";

      const pre = previewWindow.document.createElement("pre");
      pre.textContent =
        resumeText ||
        "No readable text was found in this resume.";
      pre.style.cssText =
        "margin:0;white-space:pre-wrap;word-break:break-word;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#334155;";

      shell.appendChild(heading);
      shell.appendChild(pre);
      body.appendChild(shell);
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }

      let text = "";

      try {
        if (err?.response?.data instanceof Blob) {
          const raw = await err.response.data.text();
          const parsed = JSON.parse(raw);
          text = parsed?.message || "";
        }
      } catch (_parseError) {
        // Fall through to the normal API error message.
      }

      setMessage({
        type: "error",
        text: text || apiMessage(err)
      });
    }
  }

  async function uploadResume() {
    if (!resume) { setMessage({ type: "error", text: "Choose a PDF/DOC/DOCX resume first." }); return; }
    const data = new FormData(); data.append("resume", resume);
    setBusy(true); setMessage({ type: "", text: "" });
    try {
      const response = await api.post("/auth/resume", data, { headers: { "Content-Type": "multipart/form-data" } });
      updateUser(response.data.user);
      setMessage({ type: "success", text: response.data.message || "Master Resume saved successfully." });
      setResume(null);
    } catch (err) { setMessage({ type: "error", text: apiMessage(err) }); }
    finally { setBusy(false); }
  }

  if (user.role !== "jobseeker") {
    return <section className="form-shell">
      {message.text && <div className={`app-toast ${message.type}`}>{message.text}</div>}
      <form className="card form-card" onSubmit={saveProfile}>
      <span className="eyebrow">PROFILE</span>
      <h1>{user.role === "employer" ? "Recruiter Profile" : "Platform Owner Profile"}</h1>
      <label><span>Name</span><input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label>
      {user.role === "employer" && <>
        <label><span>Company Name</span><input value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})}/></label>
        <label><span>Company Website</span><input value={form.companyWebsite} onChange={(e)=>setForm({...form,companyWebsite:e.target.value})}/></label>
        <label><span>Company Description</span><textarea rows="6" value={form.companyDescription} onChange={(e)=>setForm({...form,companyDescription:e.target.value})}/></label>
      </>}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving..." : "Save Profile"}
      </button>
    </form></section>;
  }

  return <section className="form-shell wide">
    {message.text && <div className={`app-toast ${message.type}`}>{message.text}</div>}
    <form className="card form-card onboarding-card" onSubmit={saveProfile}>
      <div className="onboarding-title">
        <div><span className="eyebrow">AUTO-APPLY SETUP</span><h1>Set up HireHub in 3 steps</h1>
          <p className="muted">Save your setup once. When Auto Apply is ON, HireHub immediately submits matching jobs at or above your selected Match Level.</p></div>
        <div className={`setup-chip ${setupReady ? "ready" : ""}`}>{setupReady ? "READY" : "INCOMPLETE"}</div>
      </div>
      <div className="step-card"><div className="step-number">1</div><div className="step-content">
        <div className="step-head"><div><h2>Master Resume</h2><p>Upload once. HireHub uses the same resume for all internal applications.</p></div>
          <span className={`status ${form.resumeUploaded ? "status-active" : "status-closed"}`}>{form.resumeUploaded ? "DONE" : "REQUIRED"}</span></div>
        {form.resumeUploaded && <div className="resume-ready">Current: <strong>{form.originalResumeName}</strong></div>}
        <div className="inline-upload">
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setResume(e.target.files?.[0] || null)}
          />
          <div className="actions">
            {form.resumeUploaded && (
              <button
                className="button ghost"
                type="button"
                onClick={viewMasterResume}
                disabled={busy}
              >
                View Resume
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={uploadResume}
              disabled={busy || !resume}
            >
              {busy
                ? "Working..."
                : form.resumeUploaded
                  ? "Update Resume"
                  : "Upload Resume"}
            </button>
          </div>
        </div>
      </div></div>

      <div className="step-card"><div className="step-number">2</div><div className="step-content">
        <div className="step-head"><div><h2>Job Preferences</h2><p>These details decide your Match Score.</p></div></div>
        <div className="grid-2">
          <label><span>Your Skills</span><input value={form.skills} onChange={(e)=>setForm({...form,skills:e.target.value})} placeholder="Python, Django, MySQL, REST API"/></label>
          <label><span>Experience</span><select value={form.experienceLevel} onChange={(e)=>setForm({...form,experienceLevel:e.target.value})}>{["Fresher","0-1 years","1-3 years","3+ years"].map(x=><option key={x}>{x}</option>)}</select></label>
          <label><span>Preferred Roles</span><input value={form.preferredRoles} onChange={(e)=>setForm({...form,preferredRoles:e.target.value})} placeholder="Python Developer, Backend Developer"/></label>
          <label><span>Preferred Locations</span><input value={form.preferredLocations} onChange={(e)=>setForm({...form,preferredLocations:e.target.value})} placeholder="Hyderabad, Bengaluru, Remote"/></label>
        </div>
        <span className="field-title">Preferred Job Types</span><div className="checkbox-group">{JOB_TYPES.map(type=><label className="check-pill" key={type}>
          <input type="checkbox" checked={form.preferredJobTypes.includes(type)} onChange={()=>toggleJobType(type)}/><span>{type}</span></label>)}</div>
      </div></div>

      <div className="step-card"><div className="step-number">3</div><div className="step-content">
        <div className="step-head"><div><h2>Auto Apply Control</h2><p>Choose the minimum Match Score required for automatic application.</p></div></div>
        <div className="grid-2">
          <label><span>Auto-Apply Match Level (%)</span><input type="number" min="30" max="100" value={form.minMatchScore} onChange={(e)=>setForm({...form,minMatchScore:e.target.value})}/></label>
          <label><span>Max Auto Applications / Day</span><input type="number" min="1" max="50" value={form.maxAutoApplicationsPerDay} onChange={(e)=>setForm({...form,maxAutoApplicationsPerDay:e.target.value})}/></label>
        </div>
        <label className="auto-toggle"><input type="checkbox" checked={form.autoApplyEnabled} onChange={(e)=>setForm({...form,autoApplyEnabled:e.target.checked})}/>
          <span><strong>{form.autoApplyEnabled ? "Auto Apply is ON" : "Enable Auto Apply"}</strong><small>Jobs with this Match Score or higher are submitted automatically.</small></span></label>
      </div></div>

      <details className="optional-details"><summary>Optional profile details</summary><div className="optional-body">
        <div className="grid-2"><label><span>Headline</span><input value={form.headline} onChange={(e)=>setForm({...form,headline:e.target.value})}/></label>
        <label><span>Current Location</span><input value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})}/></label></div>
        <label><span>Bio</span><textarea rows="4" value={form.bio} onChange={(e)=>setForm({...form,bio:e.target.value})}/></label>
      </div></details>

      <div className="setup-actions"><button className="button primary" disabled={busy}>{busy ? "Saving..." : "Save Auto-Apply Setup"}</button>
        <Link className="button secondary" to="/jobseeker">Go to Matches & Applications →</Link></div>
    </form>
  </section>;
}
