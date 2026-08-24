import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiMessage } from "../api";
import StatusBadge from "./StatusBadge";

function sourceLabel(job) {
  if (job?.sourceLabel) return job.sourceLabel;

  if (job?.source) {
    return String(job.source)
      .split(/[ _-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "HireHub";
}

function applyOptions(job) {
  const options = Array.isArray(job?.applyOptions)
    ? job.applyOptions
    : [];

  if (options.length) {
    const seen = new Set();

    return options.filter((option) => {
      const url = String(option?.url || "").trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  if (job?.applyUrl) {
    return [
      {
        source: job.source,
        sourceLabel: sourceLabel(job),
        title: sourceLabel(job),
        url: job.applyUrl
      }
    ];
  }

  return [];
}

function isAppliedStatus(status) {
  return [
    "applied",
    "shortlisted",
    "interview",
    "selected",
    "rejected"
  ].includes(status);
}

function statusLabel(status) {
  const labels = {
    saved: "Saved",
    ready_to_apply: "Ready to Apply",
    applied: "Applied",
    shortlisted: "Shortlisted",
    interview: "Interview",
    rejected: "Rejected",
    selected: "Selected",
    skipped: "Skipped"
  };

  return labels[status] || status;
}

export default function JobCard({
  job,
  employerMode = false,
  onExternalAction = null
}) {
  const external = Boolean(job.isExternal);
  const source = sourceLabel(job);
  const externalApplyOptions = useMemo(
    () => applyOptions(job),
    [job]
  );

  const [tracking, setTracking] = useState(job.tracking || null);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    setTracking(job.tracking || null);
  }, [job.tracking]);

  const trackable = external && Boolean(job.match || tracking);
  const trackedStatus = tracking?.status || "";
  const alreadyApplied = isAppliedStatus(trackedStatus);
  const primaryOption = externalApplyOptions[0] || null;
  const moreOptions = externalApplyOptions.slice(1, 6);

  async function sendAction(status, option = null) {
    if (!trackable || actionBusy) return null;

    setActionBusy(true);
    setActionError("");

    const selectedJob = option
      ? {
          ...job,
          source: option.source || job.source,
          sourceLabel:
            option.sourceLabel ||
            option.title ||
            job.sourceLabel,
          applyUrl: option.url
        }
      : job;

    try {
      const { data } = await api.post(
        "/external-applications/track",
        {
          job: selectedJob,
          status
        }
      );

      const nextTracking = data.tracking || data.item || null;
      setTracking(nextTracking);

      if (onExternalAction) {
        onExternalAction(job, nextTracking);
      }

      return nextTracking;
    } catch (err) {
      setActionError(apiMessage(err));
      return null;
    } finally {
      setActionBusy(false);
    }
  }

  async function openExternalApply(option) {
    if (!option?.url || alreadyApplied || actionBusy) return;

    /*
      Open the tab immediately so browsers do not block it after the
      async tracking request. The tab is navigated only after HireHub has
      successfully saved the job into the Apply Queue.
    */
    const popup = window.open("about:blank", "_blank");

    if (popup) {
      popup.opener = null;
      try {
        popup.document.title = "Opening job...";
        popup.document.body.innerHTML =
          '<div style="font-family:Arial,sans-serif;padding:32px">Opening application page...</div>';
      } catch (_error) {
        // Cross-browser fallback; navigation below still works.
      }
    }

    if (!trackable) {
      if (popup) {
        popup.location.href = option.url;
      } else {
        window.open(option.url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const result = await sendAction("ready_to_apply", option);

    if (!result) {
      if (popup) popup.close();
      return;
    }

    if (popup) {
      popup.location.href = option.url;
    } else {
      window.open(option.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <article
      className={`job-card ${external ? "external-job-card" : ""} ${
        trackedStatus === "skipped" ? "job-card-skipped" : ""
      }`}
    >
      <div className="job-card-head">
        <div>
          <div className="job-card-labels">
            <span className="eyebrow">{job.type}</span>

            {!employerMode && (
              <span
                className={`source-badge source-${String(
                  job.source || "hirehub"
                ).toLowerCase()}`}
              >
                {source}
              </span>
            )}
          </div>

          <h3>{job.title}</h3>

          <p className="company">
            {job.companyName ||
              job.employer?.employerProfile?.companyName ||
              "Employer"}
          </p>
        </div>

        {external ? (
          job.match ? (
            <div
              className="external-match"
              title="Your HireHub match score"
            >
              {job.match.score}%
            </div>
          ) : (
            <span className="external-live-pill">LIVE</span>
          )
        ) : (
          <StatusBadge value={job.status} />
        )}
      </div>

      <div className="job-meta">
        <span>📍 {job.location || "India"}</span>
        <span>🧑‍💻 {job.experienceLevel || "Fresher"}</span>

        {job.salaryRange?.max > 0 && (
          <span>
            ₹{Number(job.salaryRange.min || 0).toLocaleString()}–₹
            {Number(job.salaryRange.max).toLocaleString()}
          </span>
        )}
      </div>

      <div className="chips">
        {(job.skills || []).slice(0, 5).map((skill) => (
          <span className="chip" key={skill}>
            {skill}
          </span>
        ))}
      </div>

      {external && job.description && (
        <p className="external-job-snippet">{job.description}</p>
      )}

      {external && job.match && (
        <div
          className={`external-eligibility ${
            job.eligible ? "eligible" : "below"
          }`}
        >
          {job.eligible
            ? `Eligible at your ${job.matchRequirement}% level`
            : `Below your ${job.matchRequirement}% level`}
        </div>
      )}

      {external && job.postedAt && (
        <p className="muted external-posted">
          Posted: {job.postedAt}
        </p>
      )}

      {external && externalApplyOptions.length > 1 && (
        <div className="external-available-row">
          <span className="muted">Available on</span>
          <div className="external-source-list">
            {externalApplyOptions.slice(0, 5).map((option) => (
              <span
                className="external-source-mini"
                key={`${option.source}-${option.url}`}
              >
                {option.sourceLabel ||
                  option.title ||
                  "Company Site"}
              </span>
            ))}
          </div>
        </div>
      )}

      {employerMode && (
        <p className="muted">
          {job.applicantCount || 0} applicant(s)
        </p>
      )}

      {external && tracking && (
        <div
          className={`external-tracking-status tracking-${trackedStatus}`}
        >
          {statusLabel(trackedStatus)}
          {tracking.appliedAt && (
            <span>
              {" "}· {new Date(tracking.appliedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {actionError && (
        <div className="external-card-error">{actionError}</div>
      )}

      {external ? (
        <>
          {trackedStatus === "skipped" ? (
            <div className="external-tracker-actions">
              <button
                type="button"
                className="button ghost small"
                disabled={actionBusy}
                onClick={() => sendAction("saved")}
              >
                Restore Job
              </button>
            </div>
          ) : alreadyApplied ? (
            <div className="external-tracker-actions">
              <span className="application-note eligible">
                Already applied ✓
              </span>

              {primaryOption?.url && (
                <a
                  className="text-link"
                  href={primaryOption.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View listing ↗
                </a>
              )}
            </div>
          ) : (
            <>
              {primaryOption && (
                <div className="external-apply-compact">
                  <button
                    type="button"
                    className="button primary external-primary-apply"
                    disabled={actionBusy}
                    onClick={() => openExternalApply(primaryOption)}
                  >
                    {actionBusy
                      ? "Preparing..."
                      : `Apply on ${
                          primaryOption.sourceLabel ||
                          primaryOption.title ||
                          "Original Site"
                        } ↗`}
                  </button>

                  {moreOptions.length > 0 && (
                    <details className="external-more-options">
                      <summary>
                        More apply options ({moreOptions.length})
                      </summary>

                      <div className="external-more-options-menu">
                        {moreOptions.map((option) => (
                          <button
                            type="button"
                            className="external-more-option"
                            disabled={actionBusy}
                            onClick={() => openExternalApply(option)}
                            key={`${option.source}-${option.url}`}
                          >
                            {option.sourceLabel ||
                              option.title ||
                              "Company Site"}
                            <span>↗</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {trackable && (
                <div className="external-tracker-actions">
                  {trackedStatus !== "saved" && (
                    <button
                      type="button"
                      className="button ghost small"
                      disabled={actionBusy}
                      onClick={() => sendAction("saved")}
                    >
                      Save
                    </button>
                  )}

                  {(trackedStatus === "saved" ||
                    trackedStatus === "ready_to_apply") && (
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={actionBusy}
                      onClick={() => sendAction("applied")}
                    >
                      Mark as Applied
                    </button>
                  )}

                  <button
                    type="button"
                    className="button ghost small"
                    disabled={actionBusy}
                    onClick={() => sendAction("skipped")}
                  >
                    Skip
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <Link
          className="text-link"
          to={
            employerMode
              ? `/employer/jobs/${job.id}`
              : `/jobs/${job.id}`
          }
        >
          {employerMode ? "Manage job →" : "View details →"}
        </Link>
      )}
    </article>
  );
}
