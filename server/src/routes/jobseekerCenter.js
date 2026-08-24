import express from "express";

import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchExternalJobs } from "../services/externalJobsService.js";
import { calculateMatch } from "../services/matchingEngine.js";
import { decorateExternalJobsForUser } from "../services/externalApplicationService.js";
import { getProfileReadiness } from "../services/profileReadiness.js";

const router = express.Router();

router.use(requireAuth, allowRoles("jobseeker"));

router.get("/readiness", asyncHandler(async (req, res) => {
  res.json(getProfileReadiness(req.user));
}));

router.get("/recommendations", asyncHandler(async (req, res) => {
  const roles = Array.isArray(req.user.preferredRoles)
    ? req.user.preferredRoles.filter(Boolean)
    : [];
  const skills = Array.isArray(req.user.skills)
    ? req.user.skills.filter(Boolean)
    : [];
  const locations = Array.isArray(req.user.preferredLocations)
    ? req.user.preferredLocations.filter(Boolean)
    : [];
  const types = Array.isArray(req.user.preferredJobTypes)
    ? req.user.preferredJobTypes.filter(Boolean)
    : [];

  const q = String(
    roles[0] ||
    req.user.headline ||
    skills.slice(0, 3).join(" ") ||
    ""
  ).trim();

  const location = String(
    locations[0] ||
    req.user.profileLocation ||
    "India"
  ).trim();

  const type = String(types[0] || "").trim();

  if (!q) {
    return res.json({
      items: [],
      query: { q: "", location, type },
      message: "Add a preferred role, headline, or skills to receive job alerts."
    });
  }

  const result = await fetchExternalJobs({
    source: "all",
    q,
    location,
    type,
    page: 1
  });

  let items = result.items.map((job) => {
    const searchText = `${job.title} ${job.description}`.toLowerCase();
    const userSkillMatches = skills.filter((skill) => {
      const normalized = String(skill || "").trim().toLowerCase();
      return normalized && searchText.includes(normalized);
    });

    const matchJob = {
      ...job,
      skills: [...new Set([...(job.skills || []), ...userSkillMatches])]
    };

    const match = calculateMatch(req.user, matchJob);
    const matchRequirement = Number(req.user.minMatchScore || 70);

    return {
      ...matchJob,
      match,
      matchRequirement,
      eligible: Boolean(req.user.resumePath && match.score >= matchRequirement)
    };
  });

  items = await decorateExternalJobsForUser(req.user.id, items);

  const finalItems = items
    .filter((item) => ![
      "applied",
      "shortlisted",
      "interview",
      "selected",
      "rejected",
      "skipped"
    ].includes(item.tracking?.status))
    .sort((a, b) => Number(b.match?.score || 0) - Number(a.match?.score || 0))
    .slice(0, 8);

  res.json({
    items: finalItems,
    query: { q, location, type },
    matchRequirement: Number(req.user.minMatchScore || 70),
    cached: Boolean(result.cached),
    message: finalItems.length
      ? "Fresh recommendations based on your HireHub profile."
      : "No new recommendations found for your current profile."
  });
}));

export default router;
