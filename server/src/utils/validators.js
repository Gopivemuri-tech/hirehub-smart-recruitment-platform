export const PUBLIC_ROLES = ["jobseeker", "employer"];
export const JOB_TYPES = ["Full-time", "Part-time", "Internship", "Contract", "Remote"];
export const JOB_STATUSES = ["active", "closed"];
export const APPLICATION_STATUSES = ["applied", "reviewing", "shortlisted", "interview", "selected", "rejected", "hired"];

export function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

export function validEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function parseSkills(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function salaryValues(body) {
  const min = Number(body.salaryMin || 0);
  const max = Number(body.salaryMax || 0);

  if (min < 0 || max < 0 || (max > 0 && min > max)) {
    const error = new Error("Salary range is invalid.");
    error.status = 400;
    throw error;
  }

  return { min, max };
}
