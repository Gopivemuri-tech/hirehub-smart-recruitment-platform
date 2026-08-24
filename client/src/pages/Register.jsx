import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiMessage } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "jobseeker"
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const { data } = await api.post("/auth/register", form);
      login(data);

      navigate(
        data.user.role === "employer"
          ? "/employer"
          : "/jobseeker"
      );
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">JOIN HIREHUB</span>
        <h1>Create your account</h1>

        <p className="muted">
          Candidate accounts are for students and jobseekers. Recruiter
          accounts are for companies and job providers.
        </p>

        {error && <div className="alert error">{error}</div>}

        <label>
          <span>Full Name</span>
          <input
            required
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
          />
        </label>

        <label>
          <span>Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
          />
        </label>

        <label>
          <span>Password</span>

          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              minLength="8"
              required
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <small>Minimum 8 characters</small>
        </label>

        <label>
          <span>Account Type</span>
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value })
            }
          >
            <option value="jobseeker">
              Candidate / Student / Jobseeker
            </option>
            <option value="employer">
              Recruiter / Company / Job Provider
            </option>
          </select>
        </label>

        <div className="role-info-card">
          {form.role === "jobseeker" ? (
            <>
              <strong>Candidate Account</strong>
              <span>
                Build your profile, upload a Master Resume, receive Match
                Scores and track your applications.
              </span>
            </>
          ) : (
            <>
              <strong>Recruiter Account</strong>
              <span>
                Publish jobs, view candidates who apply to your openings,
                review resumes and update hiring status.
              </span>
            </>
          )}
        </div>

        <button className="button primary full" disabled={busy}>
          {busy ? "Creating..." : "Create Account"}
        </button>

        <p className="auth-foot">
          Already registered? <Link to="/login">Login</Link>
        </p>
      </form>
    </section>
  );
}
