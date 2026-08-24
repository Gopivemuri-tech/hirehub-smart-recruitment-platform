import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import logo from "../assets/hirehub-logo.png";

export default function Layout() {
  return (
    <div className="app-shell">

      {/* COMMON HIREHUB BACKGROUND FOR ALL PAGES */}
      <div className="app-background" aria-hidden="true">
        <span className="app-bg-orb app-bg-orb-one" />
        <span className="app-bg-orb app-bg-orb-two" />
        <span className="app-bg-orb app-bg-orb-three" />

        <img
          src={logo}
          alt=""
          className="app-background-logo"
        />
      </div>

      {/* GLASS LAYER ABOVE BACKGROUND */}
      <div
        className="app-glass-layer"
        aria-hidden="true"
      />

      {/* CURRENT NAVBAR - NO FUNCTION CHANGE */}
      <Navbar />

      {/* ALL CURRENT PAGES RENDER HERE */}
      <main className="page">
        <Outlet />
      </main>

      {/* CURRENT FOOTER */}
      <footer className="footer">
        HireHub · Candidate Matching · Recruiter Workflow · Platform Administration
      </footer>

    </div>
  );
}