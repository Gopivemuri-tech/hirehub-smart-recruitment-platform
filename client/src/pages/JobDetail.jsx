import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiMessage } from "../api";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/jobs/${id}`)
      .then(({ data }) => setJob(data.job))
      .catch((err) =>
        setMessage({
          type: "error",
          text: apiMessage(err)
        })
      );

    if (user?.role === "jobseeker") {
      api.get(`/auto-apply/match/${id}`)
        .then(({ data }) => setMatch(data))
        .catch(() => setMatch(null));
    }
  }, [id, user?.role]);

  async function apply(event) {
    event.preventDefault();

    setMessage({
      type: "",
      text: ""
    });

    setBusy(true);

    try {
      const { data } = await api.post(
        `/applications/${id}`,
        { coverLetter }
      );

      setMessage({
        type: "success",
        text:
          `Application submitted using your Master Resume. ` +
          `Match score: ${data.match.score}%.`
      });

      setCoverLetter("");
    } catch (err) {
      setMessage({
        type: "error",
        text: apiMessage(err)
      });
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <div className="card centered">
        Loading job...
      </div>
    );
  }

  const isRecruiterOwner =
    user?.role === "employer" &&
    Number(job.recruiterId) === Number(user.id);

  const isOtherRecruiter =
    user?.role === "employer" &&
    !isRecruiterOwner;

  const isAdmin =
    user?.role === "admin";

  return (
    <div className="detail-grid">

      <section className="card job-detail">

        <div className="job-card-head">

          <div>
            <span className="eyebrow">
              {job.type}
            </span>

            <h1>
              {job.title}
            </h1>

            <p className="company">
              {job.companyName}
            </p>
          </div>

          <div className="job-detail-actions">

            <StatusBadge
              value={job.status}
            />

            {isRecruiterOwner && (
              <Link
                className="button primary small"
                to={`/employer/jobs/${job.id}/edit`}
              >
                Edit Job
              </Link>
            )}

          </div>

        </div>

        <div className="job-meta large">

          <span>
            📍 {job.location}
          </span>

          <span>
            🧑‍💻 {job.experienceLevel}
          </span>

          {job.salaryRange?.max > 0 && (
            <span>
              ₹
              {Number(
                job.salaryRange.min
              ).toLocaleString()}
              –
              ₹
              {Number(
                job.salaryRange.max
              ).toLocaleString()}
            </span>
          )}

        </div>

        <div className="chips">

          {job.skills?.map(
            (skill) => (
              <span
                className="chip"
                key={skill}
              >
                {skill}
              </span>
            )
          )}

        </div>

        <h2>
          Job description
        </h2>

        <p className="preline">
          {job.description}
        </p>

        <h2>
          Recruiter / Company
        </h2>

        <p>
          <strong>
            {
              job.employer
                ?.employerProfile
                ?.companyName
              ||
              job.companyName
            }
          </strong>
        </p>

        <p className="muted">
          {
            job.employer
              ?.employerProfile
              ?.companyDescription
          }
        </p>

      </section>


      <aside className="card sticky-card">

        {isRecruiterOwner ? (
          <>
            <span className="eyebrow">
              RECRUITER CONTROLS
            </span>

            <h2>
              Manage this job
            </h2>

            <p className="muted">
              This opening belongs to your recruiter account.
              You can edit the job details or manage candidates
              who applied to it.
            </p>

            <div className="recruiter-job-actions">

              <Link
                className="button primary full"
                to={`/employer/jobs/${job.id}/edit`}
              >
                Edit Job Details
              </Link>

              <Link
                className="button secondary full"
                to={`/employer/jobs/${job.id}`}
              >
                View Applications
              </Link>

            </div>

            <div className="role-control-note">
              Only the recruiter who posted this job can edit it.
              Platform Admin cannot edit recruiter job content.
            </div>
          </>
        ) : user?.role === "jobseeker" ? (
          <>
            {match && (
              <div className="personal-match">

                <span>
                  Your Match
                </span>

                <strong>
                  {match.match.score}%
                </strong>

                <small>
                  Skills {match.match.breakdown.skills}% ·
                  Role {match.match.breakdown.role}% ·
                  Location {match.match.breakdown.location}%
                </small>

              </div>
            )}

            <form onSubmit={apply}>

              <h2>
                Manual Apply
              </h2>

              <p className="muted">
                Auto Apply handles suitable jobs automatically.
                You can also submit this job manually using
                the same Master Resume.
              </p>

              {message.text && (
                <div
                  className={
                    `alert ${message.type}`
                  }
                >
                  {message.text}
                </div>
              )}

              {!match?.resumeUploaded && (
                <div className="alert error">
                  Upload a Master Resume in{" "}
                  <Link to="/profile">
                    Profile
                  </Link>{" "}
                  first.
                </div>
              )}

              <label>

                <span>
                  Optional Cover Letter
                </span>

                <textarea
                  rows="7"
                  value={coverLetter}
                  onChange={(e) =>
                    setCoverLetter(
                      e.target.value
                    )
                  }
                  placeholder="Why are you a good fit?"
                />

              </label>

              <button
                className="button primary full"
                disabled={
                  busy ||
                  job.status !== "active" ||
                  !match?.resumeUploaded
                }
              >
                {
                  busy
                    ? "Submitting..."
                    : "Apply Using Master Resume"
                }
              </button>

            </form>
          </>
        ) : isAdmin ? (
          <>
            <span className="eyebrow">
              PLATFORM VIEW
            </span>

            <h2>
              Job moderation only
            </h2>

            <p className="muted">
              Platform Admin can monitor or moderate this listing
              from the Admin Dashboard, but cannot edit recruiter
              job details.
            </p>

            <Link
              className="button secondary full"
              to="/admin"
            >
              Go to Platform Admin
            </Link>
          </>
        ) : isOtherRecruiter ? (
          <>
            <span className="eyebrow">
              RECRUITER VIEW
            </span>

            <h2>
              Read-only job
            </h2>

            <p className="muted">
              This job belongs to another recruiter.
              Only the recruiter who created the opening
              can edit or manage its applicants.
            </p>

            <Link
              className="button secondary full"
              to="/employer"
            >
              My Recruiter Dashboard
            </Link>
          </>
        ) : !user ? (
          <>
            <h2>
              Want HireHub to match jobs for you?
            </h2>

            <p className="muted">
              Create a Candidate account,
              upload one Master Resume and
              enable Auto Apply.
            </p>

            <Link
              className="button primary full"
              to="/register"
            >
              Create Candidate Account
            </Link>
          </>
        ) : null}

      </aside>

    </div>
  );
}
