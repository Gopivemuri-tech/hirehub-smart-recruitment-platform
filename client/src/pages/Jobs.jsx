import { useEffect, useMemo, useState } from "react";
import { api, apiMessage } from "../api";
import JobCard from "../components/JobCard";

const types = ["", "Full-time", "Part-time", "Internship", "Contract", "Remote"];

const fallbackExternalSources = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "naukri", label: "Naukri" },
  { value: "indeed", label: "Indeed" },
  { value: "foundit", label: "Foundit" },
  { value: "internshala", label: "Internshala" },
  { value: "cutshort", label: "Cutshort" },
  { value: "wellfound", label: "Wellfound" },
  { value: "apna", label: "Apna" },
  { value: "shine", label: "Shine" },
  { value: "freshersworld", label: "Freshersworld" },
  { value: "glassdoor", label: "Glassdoor" },
  { value: "workday", label: "Workday" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" }
];

function localRequest(query) {
  return api.get("/jobs", {
    params: {
      q: query.q,
      location: query.location,
      type: query.type,
      page: query.page,
      limit: 9
    }
  });
}

function externalRequest(query, source) {
  return api.get("/external-jobs", {
    params: {
      source,
      q: query.q,
      location: query.location,
      type: query.type,
      page: query.page
    }
  });
}

function sourceDisplayLabel(sourceValue, externalSources) {
  if (sourceValue === "all") return "All";
  if (sourceValue === "hirehub") return "HireHub";

  return externalSources.find((item) => item.value === sourceValue)?.label || sourceValue;
}

export default function Jobs() {
  const [externalSources, setExternalSources] = useState(fallbackExternalSources);

  const sources = useMemo(() => [
    { value: "all", label: "All Jobs" },
    { value: "hirehub", label: "HireHub" },
    ...externalSources
  ], [externalSources]);

  const [filters, setFilters] = useState({
    q: "",
    location: "",
    type: ""
  });

  const [query, setQuery] = useState({
    q: "",
    location: "",
    type: "",
    source: "hirehub",
    page: 1
  });

  const [data, setData] = useState({
    items: [],
    pagination: null,
    meta: null,
    totalLabel: "0 active job(s)"
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSources() {
      try {
        const response = await api.get("/external-jobs/sources");
        if (cancelled) return;

        const items = Array.isArray(response.data?.items)
          ? response.data.items.filter((item) => item?.value && item?.label)
          : [];

        if (items.length) {
          setExternalSources(items);
        }
      } catch (_error) {
        // Keep the local fallback list. Job browsing must not fail because
        // the source-list helper endpoint is temporarily unavailable.
      }
    }

    loadSources();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setLoading(true);
      setError("");

      try {
        if (query.source === "hirehub") {
          const response = await localRequest(query);
          if (cancelled) return;

          setData({
            items: response.data.items || [],
            pagination: response.data.pagination || null,
            meta: { source: "hirehub" },
            totalLabel: `${response.data.pagination?.total || 0} HireHub active job(s)`
          });
          return;
        }

        if (query.source !== "all") {
          const response = await externalRequest(query, query.source);
          if (cancelled) return;

          const label = sourceDisplayLabel(query.source, externalSources);

          setData({
            items: response.data.items || [],
            pagination: response.data.pagination || null,
            meta: response.data.meta || null,
            totalLabel: `${response.data.items?.length || 0} ${label} job(s) shown on this page`
          });
          return;
        }

        const [localResponse, externalResponse] = await Promise.all([
          localRequest(query),
          externalRequest(query, "all")
        ]);

        if (cancelled) return;

        const localItems = (localResponse.data.items || []).map((job) => ({
          ...job,
          source: "hirehub",
          sourceLabel: "HireHub"
        }));

        const externalItems = externalResponse.data.items || [];

        setData({
          items: [...localItems, ...externalItems],
          pagination: {
            page: query.page,
            hasPrevious: query.page > 1,
            hasNext: Boolean(
              query.page < Number(localResponse.data.pagination?.pages || 1) ||
              externalResponse.data.pagination?.hasNext
            ),
            pages: Math.max(
              Number(localResponse.data.pagination?.pages || 1),
              Number(externalResponse.data.pagination?.pages || 1)
            )
          },
          meta: externalResponse.data.meta || null,
          totalLabel: `${localItems.length + externalItems.length} job(s) shown on this page`
        });
      } catch (err) {
        if (cancelled) return;

        setData({
          items: [],
          pagination: null,
          meta: null,
          totalLabel: "0 jobs"
        });
        setError(apiMessage(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, [query, externalSources]);

  function submit(event) {
    event.preventDefault();

    setQuery((current) => ({
      ...current,
      ...filters,
      page: 1
    }));
  }

  function changeSource(source) {
    setQuery((current) => ({
      ...current,
      source,
      page: 1
    }));
  }

  function previousPage() {
    setQuery((current) => ({
      ...current,
      page: Math.max(1, current.page - 1)
    }));
  }

  function nextPage() {
    setQuery((current) => ({
      ...current,
      page: current.page + 1
    }));
  }

  function handleExternalAction(job, tracking) {
    setData((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.isExternal && item.externalId === job.externalId
          ? { ...item, tracking }
          : item
      )
    }));
  }

  const canGoPrevious = query.page > 1;
  const canGoNext = Boolean(
    data.pagination?.hasNext ??
    (query.page < Number(data.pagination?.pages || 1))
  );

  const externalMode = query.source !== "hirehub";

  return (
    <>
      <section className="section-head">
        <div>
          <span className="eyebrow">OPPORTUNITIES</span>
          <h1>Find your next role</h1>
          <p>
            Search HireHub and major job platforms from one screen.
          </p>
        </div>
      </section>

      <div className="job-source-scroll" aria-label="Job source filters">
        <div className="tabs job-source-tabs" role="tablist" aria-label="Job source">
          {sources.map((source) => (
            <button
              type="button"
              key={source.value}
              className={`tab ${query.source === source.value ? "active" : ""}`}
              onClick={() => changeSource(source.value)}
            >
              {source.label}
            </button>
          ))}
        </div>
      </div>

      <form className="card search-bar" onSubmit={submit}>
        <input
          placeholder="Job title, company, skill..."
          value={filters.q}
          onChange={(event) => setFilters({
            ...filters,
            q: event.target.value
          })}
        />

        <input
          placeholder="Location..."
          value={filters.location}
          onChange={(event) => setFilters({
            ...filters,
            location: event.target.value
          })}
        />

        <select
          value={filters.type}
          onChange={(event) => setFilters({
            ...filters,
            type: event.target.value
          })}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {type || "All job types"}
            </option>
          ))}
        </select>

        <button className="button primary">Search</button>
      </form>

      {externalMode && (
        <div className="external-jobs-note">
          External listings open on the original job platform when you click Apply.
          HireHub Auto Apply remains unchanged and runs only for HireHub-native jobs.
        </div>
      )}

      {error && (
        <div className="alert error">{error}</div>
      )}

      {loading ? (
        <div className="card centered">Loading jobs...</div>
      ) : (
        <>
          <div className="results-line">
            {data.totalLabel}
            {data.meta?.cached ? " · cached result" : ""}
          </div>

          <div className="jobs-grid">
            {data.items.map((job) => (
              <JobCard
                job={job}
                key={`${job.source || "hirehub"}-${job.id}`}
                onExternalAction={handleExternalAction}
              />
            ))}
          </div>

          {!data.items.length && (
            <div className="card centered">
              No matching jobs found. Try another keyword, location, or source.
            </div>
          )}

          {data.pagination && (canGoPrevious || canGoNext) && (
            <div className="pagination">
              <button
                type="button"
                className="button ghost"
                disabled={!canGoPrevious}
                onClick={previousPage}
              >
                Previous
              </button>

              <span>Page {query.page}</span>

              <button
                type="button"
                className="button ghost"
                disabled={!canGoNext}
                onClick={nextPage}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

