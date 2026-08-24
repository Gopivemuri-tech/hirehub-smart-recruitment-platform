import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/hirehub-logo.png";

function navClass({ isActive }) {
  return isActive ? "nav-link active" : "nav-link";
}

function roleLabel(role) {
  if (role === "admin") return "Platform Owner";
  if (role === "employer") return "Recruiter";
  if (role === "jobseeker") return "Candidate";
  return role || "";
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate("/");
  }

  return (
    <header className="navbar">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <img src={logo} alt="HireHub" className="brand-logo" />
          <span className="brand-copy">
            <strong>HireHub</strong>
            <small>Intelligent Job Matching</small>
          </span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/jobs" className={navClass}>Jobs</NavLink>

          {user?.role === "jobseeker" && (
            <NavLink to="/jobseeker" className={navClass}>
              My Applications
            </NavLink>
          )}

          {user?.role === "employer" && (
            <NavLink to="/employer" className={navClass}>
              Recruiter Dashboard
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink to="/admin" className={navClass}>
              Platform Admin
            </NavLink>
          )}

          {user && (
            <NavLink to="/profile" className={navClass}>Profile</NavLink>
          )}
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <span className="user-pill">
                {user.name} · {roleLabel(user.role)}
              </span>
              <button className="button ghost small" onClick={signOut}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link className="button ghost small" to="/login">Login</Link>
              <Link className="button primary small" to="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
