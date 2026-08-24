import crypto from "node:crypto";

import {
  EXTERNAL_SOURCE_VALUES,
  detectJobSource,
  getJobSource,
  linkBelongsToSource
} from "./jobSourceRegistry.js";

const SERPAPI_URL = "https://serpapi.com/search.json";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 14000;
const MAX_PAGE = 10;

const responseCache = new Map();
const googleJobsPageTokens = new Map();

const SKILL_CATALOG = [
  "python", "java", "javascript", "typescript", "react", "angular", "vue",
  "node.js", "node", "express", "django", "flask", "fastapi", "spring",
  "spring boot", "html", "css", "bootstrap", "tailwind", "mysql", "postgresql",
  "mongodb", "sql", "aws", "azure", "gcp", "docker", "kubernetes", "git",
  "github", "rest api", "rest", "graphql", "machine learning", "data science",
  "pandas", "numpy", "power bi", "tableau", "excel", "c", "c++", "c#",
  ".net", "php", "laravel", "flutter", "android", "kotlin", "swift", "selenium",
  "automation", "devops", "linux", "redis", "firebase", "spark", "hadoop",
  "next.js", "nextjs", "react native", "redux", "sequelize", "prisma", "oracle",
  "snowflake", "databricks", "pytorch", "tensorflow", "scikit-learn", "nlp",
  "generative ai", "llm", "figma", "jira", "jenkins", "terraform"
];

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSource(value) {
  const source = clean(value).toLowerCase();
  if (source === "all") return "all";
  return EXTERNAL_SOURCE_VALUES.includes(source) ? source : "all";
}

function cacheKey(params) {
  return JSON.stringify(params);
}

function fromCache(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }

  return entry.value;
}

function saveCache(key, value) {
  responseCache.set(key, {
    savedAt: Date.now(),
    value
  });

  return value;
}

function containsPhrase(text, phrase) {
  const escaped = phrase
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = new RegExp(
    `(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#.])`,
    "i"
  );

  return pattern.test(text.toLowerCase());
}

function extractSkills(text) {
  const sourceText = clean(text).toLowerCase();
  const unique = [];
  const seen = new Set();

  for (const item of SKILL_CATALOG) {
    const skill = clean(item);
    const key = skill.toLowerCase();

    if (!skill || seen.has(key)) continue;
    seen.add(key);

    if (containsPhrase(sourceText, key)) {
      unique.push(skill);
    }
  }

  return unique.slice(0, 15);
}

function inferType(text, detected = {}) {
  const detectedType = clean(
    detected.schedule_type ||
    detected.work_from_home ||
    ""
  );

  const value = `${detectedType} ${clean(text)}`.toLowerCase();

  if (/\bintern(ship)?\b/.test(value)) return "Internship";
  if (/\bpart[ -]?time\b/.test(value)) return "Part-time";
  if (/\bcontract(or|ual)?\b|\bfreelance\b/.test(value)) return "Contract";
  if (/\bremote\b|work from home|\bwfh\b/.test(value)) return "Remote";
  return "Full-time";
}

function inferExperience(text) {
  const value = clean(text).toLowerCase();

  if (/fresher|entry level|graduate trainee|no experience|0\s*(?:-|–|to)\s*1\s*(?:years?|yrs?)/.test(value)) {
    return "Fresher";
  }

  const range = value.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:years?|yrs?)/i);
  if (range) {
    const min = Number(range[1]);
    if (min >= 3) return "3+ years";
    if (min >= 1) return "1-3 years";
    return "0-1 years";
  }

  const single = value.match(/(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/i);
  if (single) {
    const years = Number(single[1]);
    if (years >= 3) return "3+ years";
    if (years >= 1) return "1-3 years";
    return "0-1 years";
  }

  return "Fresher";
}

function salaryRangeFromText(text) {
  const value = clean(text).replace(/,/g, "");
  const match = value.match(
    /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs)?\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs)?/i
  );

  if (!match) return { min: 0, max: 0 };

  function amount(number, unit) {
    const numeric = Number(number || 0);
    const normalizedUnit = clean(unit).toLowerCase();

    if (normalizedUnit === "k") return Math.round(numeric * 1000);
    if (["l", "lakh", "lakhs"].includes(normalizedUnit)) {
      return Math.round(numeric * 100000);
    }

    return Math.round(numeric);
  }

  const min = amount(match[1], match[2]);
  const max = amount(match[3], match[4]);

  if (!min || !max || min > max) return { min: 0, max: 0 };
  return { min, max };
}

function stableId(prefix, ...parts) {
  return `${prefix}-${crypto
    .createHash("sha1")
    .update(parts.map((part) => clean(part)).join("|"))
    .digest("hex")
    .slice(0, 20)}`;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();

    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function flattenHighlights(job) {
  return (job.job_highlights || [])
    .flatMap((section) => section?.items || [])
    .map(clean)
    .filter(Boolean);
}

function normalizeApplyOptions(options = []) {
  const seen = new Set();
  const normalized = [];

  for (const option of options) {
    const link = clean(option?.link);
    if (!/^https?:\/\//i.test(link)) continue;

    const key = link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const detected = detectJobSource({
      title: option?.title,
      link
    });

    normalized.push({
      source: detected.value,
      sourceLabel: detected.label,
      title: clean(option?.title) || detected.label,
      url: link
    });
  }

  return normalized;
}

function normalizeGoogleJobsResult(job, searchLocation) {
  const title = clean(job?.title);
  const companyName = clean(job?.company_name) || "Employer";
  const description = clean(job?.description);
  const location = clean(job?.location) || clean(searchLocation) || "India";
  const highlights = flattenHighlights(job);
  const extensions = (job?.extensions || []).map(clean).filter(Boolean);
  const combinedText = [
    title,
    companyName,
    description,
    ...highlights,
    ...extensions
  ].filter(Boolean).join(" ");

  const applyOptions = normalizeApplyOptions(job?.apply_options || []);

  if (!applyOptions.length && /^https?:\/\//i.test(clean(job?.share_link))) {
    applyOptions.push({
      source: "googlejobs",
      sourceLabel: "Google Jobs",
      title: "Google Jobs",
      url: clean(job.share_link)
    });
  }

  if (!title || !applyOptions.length) return null;

  const primary = applyOptions.find((option) => option.source !== "company") || applyOptions[0];
  const detected = job?.detected_extensions || {};
  const postedAt = clean(detected.posted_at) ||
    extensions.find((item) => /ago|today|yesterday|day|week|month/i.test(item)) ||
    "";

  return {
    id: stableId("external-googlejobs", job?.job_id || title, companyName, location),
    externalId: clean(job?.job_id) || stableId("googlejobs", title, companyName, location),
    isExternal: true,
    source: primary.source,
    sourceLabel: primary.sourceLabel,
    availableSources: uniqueStrings(applyOptions.map((option) => option.source)),
    title,
    companyName,
    location,
    description: description || highlights.slice(0, 3).join(" ") ||
      "Open an application source to view the complete job description.",
    skills: extractSkills(combinedText),
    type: inferType(combinedText, detected),
    experienceLevel: inferExperience(combinedText),
    salaryRange: salaryRangeFromText(combinedText),
    status: "external",
    applyUrl: primary.url,
    applyOptions,
    postedAt,
    sourceSnippet: description,
    via: clean(job?.via),
    thumbnail: clean(job?.thumbnail)
  };
}

function stripPortalSuffix(title, sourceLabel) {
  const escaped = clean(sourceLabel).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return clean(title)
    .replace(new RegExp(`\\s*[|–-]\\s*${escaped}(?:\\.com)?\\s*$`, "i"), "")
    .replace(/\s*[|–-]\s*Job Search\s*$/i, "")
    .replace(/\s*[|–-]\s*Jobs?\s*$/i, "")
    .trim();
}

function parseOrganicTitle(rawTitle, source, fallbackLocation) {
  const title = stripPortalSuffix(rawTitle, source.label);

  const hiring = title.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+(.+))?$/i);
  if (hiring) {
    return {
      title: clean(hiring[2]),
      companyName: clean(hiring[1]),
      location: clean(hiring[3]) || fallbackLocation
    };
  }

  const jobsInAt = title.match(/^(.+?)\s+Job(?:s)?\s+in\s+(.+?)\s+at\s+(.+)$/i);
  if (jobsInAt) {
    return {
      title: clean(jobsInAt[1]),
      companyName: clean(jobsInAt[3]),
      location: clean(jobsInAt[2]) || fallbackLocation
    };
  }

  const atPattern = title.match(/^(.+?)\s+at\s+(.+?)(?:\s+in\s+(.+))?$/i);
  if (atPattern) {
    return {
      title: clean(atPattern[1]),
      companyName: clean(atPattern[2]),
      location: clean(atPattern[3]) || fallbackLocation
    };
  }

  return {
    title,
    companyName: `${source.label} Employer`,
    location: fallbackLocation
  };
}

function normalizeOrganicResult(result, sourceValue, searchLocation) {
  const source = getJobSource(sourceValue);
  if (!source) return null;

  const rawTitle = clean(result?.title);
  const link = clean(result?.link);
  const snippet = clean(result?.snippet);

  if (!rawTitle || !link || !linkBelongsToSource(sourceValue, link)) {
    return null;
  }

  const parsed = parseOrganicTitle(rawTitle, source, clean(searchLocation));
  const combinedText = `${parsed.title} ${parsed.companyName} ${snippet}`;
  const applyOption = {
    source: source.value,
    sourceLabel: source.label,
    title: source.label,
    url: link
  };

  return {
    id: stableId(`external-${source.value}`, link, rawTitle),
    externalId: stableId(source.value, link, rawTitle),
    isExternal: true,
    source: source.value,
    sourceLabel: source.label,
    availableSources: [source.value],
    title: parsed.title || rawTitle,
    companyName: parsed.companyName,
    location: parsed.location || clean(searchLocation) || "India",
    description: snippet || "Open the source listing to view the complete job description.",
    skills: extractSkills(combinedText),
    type: inferType(combinedText),
    experienceLevel: inferExperience(combinedText),
    salaryRange: salaryRangeFromText(combinedText),
    status: "external",
    applyUrl: link,
    applyOptions: [applyOption],
    postedAt: clean(result?.date || result?.extensions?.[0] || ""),
    sourceSnippet: snippet
  };
}

async function serpApiRequest(params) {
  const apiKey = clean(process.env.SERPAPI_KEY);

  if (!apiKey) {
    const error = new Error(
      "SERPAPI_KEY is not configured. Add it to server/.env and restart HireHub."
    );
    error.status = 503;
    throw error;
  }

  const url = new URL(SERPAPI_URL);

  Object.entries({ ...params, api_key: apiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && clean(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      const error = new Error(
        data.error || `SerpAPI request failed (${response.status}).`
      );
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "External job search timed out. Please search again."
      );
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function genericJobsQuery(q, location, type) {
  return [
    clean(q) || "software developer",
    clean(location),
    clean(type)
  ].filter(Boolean).join(" ");
}

function sourceSiteExpression(source) {
  const sites = source.searchSites.length ? source.searchSites : source.domains;

  if (sites.length === 1) {
    return `site:${sites[0]}`;
  }

  return `(${sites.map((site) => `site:${site}`).join(" OR ")})`;
}

function portalQuery(source, q, location, type) {
  return [
    sourceSiteExpression(source),
    clean(q) || "software developer",
    clean(location),
    clean(type),
    "jobs"
  ].filter(Boolean).join(" ");
}

function googleJobsQueryKey({ q, location, type }) {
  return cacheKey({
    q: clean(q).toLowerCase(),
    location: clean(location).toLowerCase(),
    type: clean(type).toLowerCase()
  });
}

function tokenMapForQuery(queryKey) {
  let entry = googleJobsPageTokens.get(queryKey);

  if (!entry || Date.now() - entry.savedAt > CACHE_TTL_MS) {
    entry = {
      savedAt: Date.now(),
      tokens: new Map([[1, ""]])
    };
    googleJobsPageTokens.set(queryKey, entry);
  }

  return entry;
}

async function fetchGoogleJobsRaw({ q, location, type, page }) {
  const safePage = Math.max(1, Math.min(MAX_PAGE, Number(page) || 1));
  const queryKey = googleJobsQueryKey({ q, location, type });
  const tokenEntry = tokenMapForQuery(queryKey);

  for (let currentPage = 1; currentPage < safePage; currentPage += 1) {
    if (tokenEntry.tokens.has(currentPage + 1)) continue;

    const currentToken = tokenEntry.tokens.get(currentPage);
    if (currentPage > 1 && !currentToken) {
      return {
        data: { jobs_results: [] },
        hasNext: false,
        page: safePage,
        cached: false
      };
    }

    const params = {
      engine: "google_jobs",
      google_domain: "google.co.in",
      gl: "in",
      hl: "en",
      q: genericJobsQuery(q, location, type)
    };

    if (location) params.location = clean(location);
    if (currentToken) params.next_page_token = currentToken;

    const stepCacheKey = cacheKey({ engine: "google_jobs", ...params });
    let step = fromCache(stepCacheKey);

    if (!step) {
      step = await serpApiRequest(params);
      saveCache(stepCacheKey, step);
    }

    const nextToken = clean(step?.serpapi_pagination?.next_page_token);
    if (!nextToken) {
      return {
        data: { jobs_results: [] },
        hasNext: false,
        page: safePage,
        cached: Boolean(fromCache(stepCacheKey))
      };
    }

    tokenEntry.tokens.set(currentPage + 1, nextToken);
    tokenEntry.savedAt = Date.now();
  }

  const pageToken = tokenEntry.tokens.get(safePage) || "";
  const params = {
    engine: "google_jobs",
    google_domain: "google.co.in",
    gl: "in",
    hl: "en",
    q: genericJobsQuery(q, location, type)
  };

  if (location) params.location = clean(location);
  if (pageToken) params.next_page_token = pageToken;

  const key = cacheKey({ engine: "google_jobs", ...params });
  const cached = fromCache(key);
  const data = cached || await serpApiRequest(params);

  if (!cached) saveCache(key, data);

  const nextToken = clean(data?.serpapi_pagination?.next_page_token);
  if (nextToken) {
    tokenEntry.tokens.set(safePage + 1, nextToken);
    tokenEntry.savedAt = Date.now();
  }

  return {
    data,
    hasNext: Boolean(nextToken),
    page: safePage,
    cached: Boolean(cached)
  };
}

function dedupeJobs(items) {
  const seen = new Set();
  const merged = [];

  for (const item of items) {
    const key = [
      clean(item.title).toLowerCase(),
      clean(item.companyName).toLowerCase(),
      clean(item.location).toLowerCase()
    ].join("|");

    const existingIndex = merged.findIndex((candidate) => candidate.__dedupeKey === key);

    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      const options = normalizeApplyOptions([
        ...(existing.applyOptions || []).map((option) => ({
          title: option.title || option.sourceLabel,
          link: option.url
        })),
        ...(item.applyOptions || []).map((option) => ({
          title: option.title || option.sourceLabel,
          link: option.url
        }))
      ]);

      merged[existingIndex] = {
        ...existing,
        skills: uniqueStrings([...(existing.skills || []), ...(item.skills || [])]).slice(0, 15),
        applyOptions: options,
        availableSources: uniqueStrings(options.map((option) => option.source))
      };
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...item, __dedupeKey: key });
  }

  return merged.map(({ __dedupeKey, ...item }) => item);
}

async function fetchAllPlatforms({ q, location, type, page }) {
  const raw = await fetchGoogleJobsRaw({ q, location, type, page });

  const items = dedupeJobs(
    (raw.data?.jobs_results || [])
      .map((job) => normalizeGoogleJobsResult(job, location))
      .filter(Boolean)
  );

  return {
    items,
    pagination: {
      page: raw.page,
      limit: 10,
      hasPrevious: raw.page > 1,
      hasNext: raw.hasNext,
      pages: raw.hasNext ? raw.page + 1 : raw.page
    },
    provider: "SerpAPI Google Jobs",
    cached: raw.cached,
    strategy: "google_jobs"
  };
}

async function fetchPortalJobs({ sourceValue, q, location, type, page }) {
  const source = getJobSource(sourceValue);

  if (!source) {
    const error = new Error(`Unsupported external job source: ${sourceValue}`);
    error.status = 400;
    throw error;
  }

  const safePage = Math.max(1, Math.min(MAX_PAGE, Number(page) || 1));
  const start = (safePage - 1) * 10;
  const params = {
    engine: "google",
    google_domain: "google.co.in",
    gl: "in",
    hl: "en",
    safe: "active",
    q: portalQuery(source, q, location, type),
    start
  };

  if (location) params.location = clean(location);

  const key = cacheKey({ engine: "google", sourceValue, ...params });
  const cached = fromCache(key);
  const data = cached || await serpApiRequest(params);

  if (!cached) saveCache(key, data);

  const items = dedupeJobs(
    (data?.organic_results || [])
      .map((result) => normalizeOrganicResult(result, sourceValue, location))
      .filter(Boolean)
  );

  return {
    items,
    pagination: {
      page: safePage,
      limit: 10,
      hasPrevious: safePage > 1,
      hasNext: Boolean(data?.serpapi_pagination?.next),
      pages: data?.serpapi_pagination?.next ? safePage + 1 : safePage
    },
    provider: "SerpAPI Google Search",
    cached: Boolean(cached),
    strategy: "source_site_search"
  };
}

export async function fetchExternalJobs({
  source = "all",
  q = "",
  location = "",
  type = "",
  page = 1
} = {}) {
  const normalizedSource = normalizeSource(source);
  const safePage = Math.max(1, Math.min(MAX_PAGE, Number(page) || 1));

  if (normalizedSource === "all") {
    return fetchAllPlatforms({
      q,
      location,
      type,
      page: safePage
    });
  }

  return fetchPortalJobs({
    sourceValue: normalizedSource,
    q,
    location,
    type,
    page: safePage
  });
}

