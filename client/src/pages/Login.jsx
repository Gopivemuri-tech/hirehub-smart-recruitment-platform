import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiMessage } from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
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
      const { data } = await api.post("/auth/login", form);
      login(data);

      const target =
        data.user.role === "employer"
          ? "/employer"
          : data.user.role === "admin"
            ? "/admin"
            : "/jobseeker";

      navigate(target);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">WELCOME BACK</span>
        <h1>Login to HireHub</h1>
        <p className="muted">
          Access your candidate, recruiter or platform dashboard.
        </p>

        {error && <div className="alert error">{error}</div>}

        <label>
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
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
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
            />

            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button className="button primary full" disabled={busy}>
          {busy ? "Signing in..." : "Login"}
        </button>

        <p className="auth-foot">
          New to HireHub? <Link to="/register">Create account</Link>
        </p>
      </form>
    </section>
  );
}
