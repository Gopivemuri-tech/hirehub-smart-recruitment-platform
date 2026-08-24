import { Op } from "sequelize";
import { Jobseeker, Job, Application } from "../models/index.js";

const WEIGHTS = Object.freeze({
  skills: 50,
  role: 20,
  location: 15,
  jobType: 10,
  experience: 5
});

const EXPERIENCE_RANK = Object.freeze({
  "Fresher": 0,
  "0-1 years": 1,
  "1-3 years": 2,
  "3+ years": 3
});

function clean(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedList(value) {
  return (Array.isArray(value) ? value : [])
    .map(clean)
    .filter(Boolean);
}

function words(value) {
  return new Set(
    clean(value)
      .replace(/[^a-z0-9+#. ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1)
  );
}

function tokenOverlapScore(preferredRole, jobTitle) {
  const preferred = words(preferredRole);
  const title = words(jobTitle);

  if (!preferred.size) return 0;

  let matched = 0;
  for (const token of preferred) {
    if (title.has(token)) matched += 1;
  }

  return Math.round((matched / preferred.size) * 100);
}

function skillScore(userSkills, jobSkills) {
  const user = new Set(normalizedList(userSkills));
  const required = normalizedList(jobSkills);

  if (!required.length) return 60;
  if (!user.size) return 0;

  const matched = required.filter((skill) => user.has(skill)).length;
  return Math.round((matched / required.length) * 100);
}

function roleScore(preferredRoles, title) {
  const roles = normalizedList(preferredRoles);
  if (!roles.length) return 50;

  return Math.max(...roles.map((role) => tokenOverlapScore(role, title)));
}

function locationScore(preferredLocations, location, jobType) {
  const preferences = normalizedList(preferredLocations);
  if (!preferences.length) return 50;

  const target = clean(location);
  const isRemote = clean(jobType) === "remote" || target.includes("remote");

  for (const preferred of preferences) {
    if (preferred === "remote" && isRemote) return 100;
    if (target.includes(preferred) || preferred.includes(target)) return 100;
  }

  return 0;
}

function jobTypeScore(preferredJobTypes, jobType) {
  const preferences = normalizedList(preferredJobTypes);
  if (!preferences.length) return 50;
  return preferences.includes(clean(jobType)) ? 100 : 0;
}

function experienceScore(candidateLevel, requiredLevel) {
  const candidate = EXPERIENCE_RANK[candidateLevel] ?? 0;
  const required = EXPERIENCE_RANK[requiredLevel] ?? 0;

  if (candidate >= required) return 100;
  if (candidate + 1 === required) return 50;
  return 0;
}

export function calculateMatch(user, job) {
  const breakdown = {
    skills: skillScore(user.skills, job.skills),
    role: roleScore(user.preferredRoles, job.title),
    location: locationScore(user.preferredLocations, job.location, job.type),
    jobType: jobTypeScore(user.preferredJobTypes, job.type),
    experience: experienceScore(user.experienceLevel, job.experienceLevel)
  };

  const score = Math.round(
    (breakdown.skills * WEIGHTS.skills / 100) +
    (breakdown.role * WEIGHTS.role / 100) +
    (breakdown.location * WEIGHTS.location / 100) +
    (breakdown.jobType * WEIGHTS.jobType / 100) +
    (breakdown.experience * WEIGHTS.experience / 100)
  );

  const matchedSkills = normalizedList(job.skills).filter((skill) =>
    new Set(normalizedList(user.skills)).has(skill)
  );

  return {
    score,
    breakdown,
    matchedSkills,
    weights: WEIGHTS
  };
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

async function todaysAutoCount(userId) {
  return Application.count({
    where: {
      jobseekerId: userId,
      applicationMethod: "auto",
      appliedAt: { [Op.gte]: startOfToday() }
    }
  });
}

export async function createApplicationFromMatch({
  user,
  job,
  method = "auto",
  coverLetter = ""
}) {
  if (!user.resumePath || !user.originalResumeName) {
    return { created: false, reason: "resume_missing" };
  }

  const existing = await Application.findOne({
    where: {
      jobId: job.id,
      jobseekerId: user.id
    }
  });

  if (existing) {
    return { created: false, reason: "already_applied", application: existing };
  }

  const match = calculateMatch(user, job);

  const application = await Application.create({
    jobId: job.id,
    jobseekerId: user.id,
    resumePath: user.resumePath,
    originalResumeName: user.originalResumeName,
    coverLetter,
    applicationMethod: method,
    matchScore: match.score,
    matchBreakdown: match.breakdown,
    status: "applied"
  });

  return {
    created: true,
    application,
    match
  };
}


export async function autoApplyForUser(user) {
  if (user.role !== "jobseeker" || !user.isActive) {
    return { created: 0, checked: 0, eligible: 0, belowRequirement: 0, alreadyApplied: 0,
      reason: "account_not_ready", message: "Jobseeker account is not ready for Auto Apply.", applications: [] };
  }

  if (!user.resumePath) {
    return { created: 0, checked: 0, eligible: 0, belowRequirement: 0, alreadyApplied: 0,
      reason: "resume_missing", message: "Upload your Master Resume first.", applications: [] };
  }

  if (!user.autoApplyEnabled) {
    return { created: 0, checked: 0, eligible: 0, belowRequirement: 0, alreadyApplied: 0,
      reason: "auto_apply_disabled", message: "Auto Apply is OFF. Enable it in Profile first.", applications: [] };
  }

  const maxPerDay = Math.min(50, Math.max(1, Number(user.maxAutoApplicationsPerDay || 10)));
  const alreadyToday = await todaysAutoCount(user.id);
  let remaining = Math.max(0, maxPerDay - alreadyToday);

  if (!remaining) {
    return { created: 0, checked: 0, eligible: 0, belowRequirement: 0, alreadyApplied: 0,
      reason: "daily_limit_reached", message: `Daily Auto Apply limit (${maxPerDay}) already reached.`, applications: [] };
  }

  const existing = await Application.findAll({
    where: { jobseekerId: user.id }, attributes: ["jobId"]
  });
  const appliedIds = new Set(existing.map((item) => Number(item.jobId)));

  const jobs = await Job.findAll({ where: { status: "active" }, order: [["createdAt", "DESC"]] });
  const scored = jobs.map((job) => ({ job, match: calculateMatch(user, job), alreadyApplied: appliedIds.has(Number(job.id)) }));
  const minimumScore = Number(user.minMatchScore || 75);
  const eligibleItems = scored.filter((x) => !x.alreadyApplied && x.match.score >= minimumScore);
  const belowItems = scored.filter((x) => !x.alreadyApplied && x.match.score < minimumScore);
  const alreadyAppliedCount = scored.filter((x) => x.alreadyApplied).length;

  const applications = [];
  for (const item of eligibleItems.sort((a,b) => b.match.score - a.match.score)) {
    if (remaining <= 0) break;
    const result = await createApplicationFromMatch({
      user, job: item.job, method: "auto",
      coverLetter: "Automatically submitted by HireHub based on saved preferences and minimum match requirement."
    });
    if (result.created) {
      applications.push({ applicationId: result.application.id, jobId: item.job.id, title: item.job.title, score: item.match.score });
      remaining -= 1;
    }
  }

  let reason = "";
  let message = "";
  if (applications.length) message = `Auto-applied to ${applications.length} suitable job(s).`;
  else if (!jobs.length) { reason = "no_active_jobs"; message = "There are no active jobs right now."; }
  else if (alreadyAppliedCount === jobs.length) { reason = "all_already_applied"; message = "You already applied to all active jobs."; }
  else if (!eligibleItems.length) { reason = "no_suitable_jobs"; message = `No new jobs reached your ${minimumScore}% minimum match requirement.`; }
  else { reason = "nothing_created"; message = "No new applications were created."; }

  return {
    created: applications.length,
    checked: jobs.length,
    eligible: eligibleItems.length,
    belowRequirement: belowItems.length,
    alreadyApplied: alreadyAppliedCount,
    matchRequirement: minimumScore,
    dailyLimit: maxPerDay,
    reason,
    message,
    applications
  };
}

export async function autoApplyForJob(job) {
  if (!job || job.status !== "active") {
    return { created: 0, candidatesChecked: 0 };
  }

  const candidates = await Jobseeker.findAll({
    where: {
      isActive: true,
      autoApplyEnabled: true,
      resumePath: { [Op.ne]: null }
    }
  });

  let created = 0;

  for (const user of candidates) {
    const currentCount = await todaysAutoCount(user.id);
    const limit = Math.min(50, Math.max(1, Number(user.maxAutoApplicationsPerDay || 10)));

    if (currentCount >= limit) continue;

    const match = calculateMatch(user, job);
    if (match.score < Number(user.minMatchScore || 75)) continue;

    const result = await createApplicationFromMatch({
      user,
      job,
      method: "auto",
      coverLetter: "Automatically submitted by HireHub based on the jobseeker's saved preferences and minimum match requirement."
    });

    if (result.created) created += 1;
  }

  return {
    created,
    candidatesChecked: candidates.length
  };
}

export async function getMatchesForUser(user) {
  const jobs = await Job.findAll({
    where: { status: "active" },
    order: [["createdAt", "DESC"]]
  });

  const applications = await Application.findAll({
    where: { jobseekerId: user.id },
    attributes: ["jobId", "applicationMethod", "matchScore", "status"]
  });

  const appMap = new Map(
    applications.map((app) => [Number(app.jobId), app.toJSON()])
  );

  return jobs
    .map((job) => {
      const match = calculateMatch(user, job);
      const application = appMap.get(Number(job.id)) || null;

      return {
        job: job.toApiObject(),
        match,
        application,
        eligible: Boolean(
          user.resumePath &&
          match.score >= Number(user.minMatchScore || 75)
        )
      };
    })
    .sort((a, b) => b.match.score - a.match.score);
}
