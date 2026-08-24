import express from "express";

import { optionalAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { calculateMatch } from "../services/matchingEngine.js";
import { decorateExternalJobsForUser } from "../services/externalApplicationService.js";
import { fetchExternalJobs } from "../services/externalJobsService.js";
import {
  EXTERNAL_SOURCE_VALUES,
  getPublicJobSources
} from "../services/jobSourceRegistry.js";
import { JOB_TYPES } from "../utils/validators.js";

const router = express.Router();

router.get("/sources", (_req, res) => {
  res.json({
    items: getPublicJobSources()
  });
});

router.get("/", optionalAuth, asyncHandler(async (req, res) => {
  const source = String(req.query.source || "all").trim().toLowerCase();
  const q = String(req.query.q || "").trim();
  const location = String(req.query.location || "").trim();
  const requestedType = String(req.query.type || "").trim();
  const type = JOB_TYPES.includes(requestedType) ? requestedType : "";
  const page = Math.max(1, Math.min(10, Number(req.query.page || 1)));

  if (source !== "all" && !EXTERNAL_SOURCE_VALUES.includes(source)) {
    return res.status(400).json({
      message: `External source must be all or one of: ${EXTERNAL_SOURCE_VALUES.join(", ")}.`
    });
  }

  const result = await fetchExternalJobs({
    source,
    q,
    location,
    type,
    page
  });

  let items = result.items.map((job) => {
    if (req.user?.role !== "jobseeker") {
      return job;
    }

    const searchText = `${job.title} ${job.description}`.toLowerCase();
    const userSkillMatches = (req.user.skills || []).filter((skill) => {
      const normalizedSkill = String(skill || "").trim().toLowerCase();
      return normalizedSkill && searchText.includes(normalizedSkill);
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
      eligible: Boolean(
        req.user.resumePath &&
        match.score >= matchRequirement
      ),
      matchRequirement
    };
  });

  if (req.user?.role === "jobseeker") {
    items = await decorateExternalJobsForUser(req.user.id, items);
  }

  res.json({
    items,
    pagination: result.pagination,
    meta: {
      source,
      provider: result.provider,
      strategy: result.strategy,
      cached: result.cached,
      external: true,
      supportedSources: getPublicJobSources()
    }
  });
}));

export default router;

