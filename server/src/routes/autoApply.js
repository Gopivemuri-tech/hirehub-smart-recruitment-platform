import express from "express";

import { Job } from "../models/index.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  autoApplyForUser,
  calculateMatch,
  getMatchesForUser
} from "../services/matchingEngine.js";

const router = express.Router();

router.use(requireAuth, allowRoles("jobseeker"));

router.get("/matches", asyncHandler(async (req, res) => {
  const items = await getMatchesForUser(req.user);

  const eligibleCount = items.filter((item) => !item.application && item.eligible).length;
  const belowRequirementCount = items.filter((item) => !item.application && !item.eligible).length;
  const appliedCount = items.filter((item) => Boolean(item.application)).length;

  res.json({
    settings: {
      autoApplyEnabled: req.user.autoApplyEnabled,
      minMatchScore: req.user.minMatchScore,
      maxAutoApplicationsPerDay: req.user.maxAutoApplicationsPerDay,
      resumeUploaded: Boolean(req.user.resumePath),
      resumeName: req.user.originalResumeName || ""
    },
    summary: { totalActiveJobs: items.length, eligibleCount, belowRequirementCount, appliedCount },
    items
  });
}));

router.get("/match/:jobId", asyncHandler(async (req, res) => {
  const job = await Job.findByPk(req.params.jobId);

  if (!job) {
    return res.status(404).json({ message: "Job not found." });
  }

  res.json({
    match: calculateMatch(req.user, job),
    matchRequirement: req.user.minMatchScore,
    resumeUploaded: Boolean(req.user.resumePath)
  });
}));

router.post("/run", asyncHandler(async (req, res) => {
  const result = await autoApplyForUser(req.user);

  res.json({ message: result.message, result });
}));

export default router;
