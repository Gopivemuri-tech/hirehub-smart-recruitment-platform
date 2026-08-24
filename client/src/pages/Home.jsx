import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/hirehub-logo.png";

export default function Home() {
  const { user } = useAuth();

  const target =
    user?.role === "jobseeker"
      ? "/jobseeker"
      : user?.role === "employer"
        ? "/employer"
        : user?.role === "admin"
          ? "/admin"
          : "/jobs";

  const label =
    user?.role === "jobseeker"
      ? "View My Matches"
      : user?.role === "employer"
        ? "Recruiter Dashboard"
        : user?.role === "admin"
          ? "Platform Dashboard"
          : "Explore Jobs";

  return (
    <section className="final-home">
      <img
        className="final-home-watermark"
        src={logo}
        alt=""
        aria-hidden="true"
      />

      <div className="final-home-glass" aria-hidden="true" />

      <div className="final-home-content">
        <span className="eyebrow">INTELLIGENT JOB MATCHING</span>

        <h1>
          Smart matching.
          <br />
          Faster applications.
        </h1>

        <p>
          One resume. Your preferences. Suitable jobs applied automatically.
        </p>

        <div className="actions">
          <Link className="button primary" to={target}>
            {label}
          </Link>

          {!user && (
            <Link className="button home-outline-button" to="/register">
              Create Account
            </Link>
          )}
        </div>
      </div>

      <div className="final-home-logo">
        <img src={logo} alt="HireHub" />
      </div>
    </section>
  );
}
