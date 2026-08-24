import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="card centered">
      <h1>404</h1>
      <p className="muted">The page you requested does not exist.</p>
      <Link className="button primary" to="/">Back Home</Link>
    </div>
  );
}
