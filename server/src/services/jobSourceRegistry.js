const SOURCES = [
  {
    value: "linkedin",
    label: "LinkedIn",
    domains: ["linkedin.com"],
    searchSites: ["linkedin.com/jobs/view"],
    aliases: ["linkedin"]
  },
  {
    value: "naukri",
    label: "Naukri",
    domains: ["naukri.com"],
    searchSites: ["naukri.com/job-listings"],
    aliases: ["naukri", "naukri.com"]
  },
  {
    value: "indeed",
    label: "Indeed",
    domains: ["indeed.com", "in.indeed.com"],
    searchSites: ["in.indeed.com/viewjob", "indeed.com/viewjob"],
    aliases: ["indeed"]
  },
  {
    value: "foundit",
    label: "Foundit",
    domains: ["foundit.in", "foundit.com"],
    searchSites: ["foundit.in/job"],
    aliases: ["foundit", "monster india", "monster"]
  },
  {
    value: "internshala",
    label: "Internshala",
    domains: ["internshala.com"],
    searchSites: ["internshala.com/job", "internshala.com/internship"],
    aliases: ["internshala"]
  },
  {
    value: "cutshort",
    label: "Cutshort",
    domains: ["cutshort.io"],
    searchSites: ["cutshort.io/job"],
    aliases: ["cutshort"]
  },
  {
    value: "wellfound",
    label: "Wellfound",
    domains: ["wellfound.com"],
    searchSites: ["wellfound.com/jobs"],
    aliases: ["wellfound", "angellist talent", "angellist"]
  },
  {
    value: "apna",
    label: "Apna",
    domains: ["apna.co"],
    searchSites: ["apna.co/job"],
    aliases: ["apna"]
  },
  {
    value: "shine",
    label: "Shine",
    domains: ["shine.com"],
    searchSites: ["shine.com/jobs"],
    aliases: ["shine", "shine.com"]
  },
  {
    value: "freshersworld",
    label: "Freshersworld",
    domains: ["freshersworld.com"],
    searchSites: ["freshersworld.com/jobs"],
    aliases: ["freshersworld"]
  },
  {
    value: "glassdoor",
    label: "Glassdoor",
    domains: ["glassdoor.com", "glassdoor.co.in"],
    searchSites: ["glassdoor.co.in/job-listing", "glassdoor.com/job-listing"],
    aliases: ["glassdoor"]
  },
  {
    value: "workday",
    label: "Workday",
    domains: ["myworkdayjobs.com"],
    searchSites: ["myworkdayjobs.com"],
    aliases: ["workday", "myworkdayjobs"]
  },
  {
    value: "greenhouse",
    label: "Greenhouse",
    domains: ["greenhouse.io"],
    searchSites: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
    aliases: ["greenhouse"]
  },
  {
    value: "lever",
    label: "Lever",
    domains: ["lever.co"],
    searchSites: ["jobs.lever.co"],
    aliases: ["lever"]
  }
];

export const JOB_SOURCE_REGISTRY = Object.freeze(
  Object.fromEntries(SOURCES.map((source) => [source.value, Object.freeze(source)]))
);

export const EXTERNAL_SOURCE_VALUES = Object.freeze(
  SOURCES.map((source) => source.value)
);

export function getJobSource(value) {
  return JOB_SOURCE_REGISTRY[String(value || "").trim().toLowerCase()] || null;
}

export function getPublicJobSources() {
  return SOURCES.map(({ value, label }) => ({ value, label }));
}

function safeHostname(link) {
  try {
    return new URL(String(link || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function hostMatchesDomain(hostname, domain) {
  const normalizedDomain = String(domain || "").toLowerCase().replace(/^www\./, "");
  return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

export function detectJobSource({ title = "", link = "" } = {}) {
  const hostname = safeHostname(link);
  const normalizedTitle = String(title || "").trim().toLowerCase();

  for (const source of SOURCES) {
    if (hostname && source.domains.some((domain) => hostMatchesDomain(hostname, domain))) {
      return source;
    }
  }

  for (const source of SOURCES) {
    if (source.aliases.some((alias) => normalizedTitle.includes(alias))) {
      return source;
    }
  }

  return {
    value: "company",
    label: String(title || "").trim() || "Company Careers",
    domains: hostname ? [hostname] : [],
    searchSites: [],
    aliases: []
  };
}

export function linkBelongsToSource(sourceValue, link) {
  const source = getJobSource(sourceValue);
  if (!source) return false;

  const hostname = safeHostname(link);
  return Boolean(
    hostname && source.domains.some((domain) => hostMatchesDomain(hostname, domain))
  );
}

