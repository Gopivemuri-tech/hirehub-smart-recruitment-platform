import express from "express";

import {
  Admin,
  Recruiter,
  Jobseeker,
  Job,
  Application,
  ExternalApplication
} from "../models/index.js";

import {
  requireAuth,
  allowRoles
} from "../middleware/auth.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  JOB_STATUSES
} from "../utils/validators.js";

const router = express.Router();

router.use(
  requireAuth,
  allowRoles("admin")
);

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [
      admins,
      recruiters,
      jobseekers,
      jobs,
      activeJobs,
      applications,
      externalTracked
    ] = await Promise.all([
      Admin.count(),
      Recruiter.count(),
      Jobseeker.count(),
      Job.count(),
      Job.count({
        where: { status: "active" }
      }),
      Application.count(),
      ExternalApplication.count()
    ]);

    res.json({
      users:
        admins + recruiters + jobseekers,
      admins,
      employers: recruiters,
      jobseekers,
      jobs,
      activeJobs,
      applications,
      externalTracked,
      totalApplicationActivity: applications + externalTracked
    });
  })
);

router.get(
  "/analytics",
  asyncHandler(async (_req, res) => {
    const [nativeApplications, externalApplications] = await Promise.all([
      Application.findAll({
        attributes: ["status", "applicationMethod", "matchScore"]
      }),
      ExternalApplication.findAll({
        attributes: ["source", "sourceLabel", "status", "matchScore"]
      })
    ]);

    const pipelineStatuses = [
      "applied",
      "reviewing",
      "shortlisted",
      "interview",
      "selected",
      "hired",
      "rejected"
    ];

    const pipeline = Object.fromEntries(
      pipelineStatuses.map((status) => [status, 0])
    );

    for (const item of nativeApplications) {
      if (pipeline[item.status] !== undefined) {
        pipeline[item.status] += 1;
      }
    }

    for (const item of externalApplications) {
      if (pipeline[item.status] !== undefined) {
        pipeline[item.status] += 1;
      }
    }

    const sourceMap = new Map();

    sourceMap.set("hirehub", {
      source: "hirehub",
      label: "HireHub",
      tracked: nativeApplications.length,
      applied: nativeApplications.length,
      shortlisted: nativeApplications.filter((item) => item.status === "shortlisted").length,
      interview: nativeApplications.filter((item) => item.status === "interview").length,
      selected: nativeApplications.filter((item) => ["selected", "hired"].includes(item.status)).length,
      rejected: nativeApplications.filter((item) => item.status === "rejected").length,
      averageMatch: nativeApplications.length
        ? Math.round(nativeApplications.reduce((sum, item) => sum + Number(item.matchScore || 0), 0) / nativeApplications.length)
        : 0
    });

    for (const item of externalApplications) {
      const key = String(item.source || "external").toLowerCase();
      const current = sourceMap.get(key) || {
        source: key,
        label: item.sourceLabel || key,
        tracked: 0,
        applied: 0,
        shortlisted: 0,
        interview: 0,
        selected: 0,
        rejected: 0,
        matchTotal: 0
      };

      current.tracked += 1;
      current.matchTotal = Number(current.matchTotal || 0) + Number(item.matchScore || 0);

      if (["applied", "shortlisted", "interview", "selected", "rejected"].includes(item.status)) {
        current.applied += 1;
      }
      if (item.status === "shortlisted") current.shortlisted += 1;
      if (item.status === "interview") current.interview += 1;
      if (item.status === "selected") current.selected += 1;
      if (item.status === "rejected") current.rejected += 1;

      sourceMap.set(key, current);
    }

    const sourcePerformance = [...sourceMap.values()]
      .map((item) => ({
        ...item,
        averageMatch: item.averageMatch ?? (
          item.tracked ? Math.round(Number(item.matchTotal || 0) / item.tracked) : 0
        ),
        conversionRate: item.tracked
          ? Math.round((Number(item.applied || 0) / item.tracked) * 100)
          : 0,
        matchTotal: undefined
      }))
      .sort((a, b) => b.tracked - a.tracked);

    res.json({
      pipeline,
      sourcePerformance,
      totals: {
        nativeApplications: nativeApplications.length,
        externalTracked: externalApplications.length,
        externalApplied: externalApplications.filter((item) => [
          "applied",
          "shortlisted",
          "interview",
          "selected",
          "rejected"
        ].includes(item.status)).length,
        autoApplied: nativeApplications.filter((item) => item.applicationMethod === "auto").length
      }
    });
  })
);

router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const [
      admins,
      recruiters,
      jobseekers
    ] = await Promise.all([
      Admin.findAll({
        order: [["createdAt", "DESC"]]
      }),
      Recruiter.findAll({
        order: [["createdAt", "DESC"]]
      }),
      Jobseeker.findAll({
        order: [["createdAt", "DESC"]]
      })
    ]);

    const items = [
      ...admins.map((x) =>
        x.toSafeObject()
      ),
      ...recruiters.map((x) =>
        x.toSafeObject()
      ),
      ...jobseekers.map((x) =>
        x.toSafeObject()
      )
    ].sort((a, b) =>
      new Date(b.createdAt) -
      new Date(a.createdAt)
    );

    res.json({ items });
  })
);

router.put(
  "/users/:role/:id/toggle-active",
  asyncHandler(async (req, res) => {
    const role =
      String(req.params.role || "");

    let account = null;

    if (role === "employer") {
      account =
        await Recruiter.findByPk(
          req.params.id
        );
    } else if (role === "jobseeker") {
      account =
        await Jobseeker.findByPk(
          req.params.id
        );
    } else {
      return res.status(400).json({
        message:
          "Only Recruiter or Candidate accounts can be enabled/disabled here."
      });
    }

    if (!account) {
      return res.status(404).json({
        message: "Account not found."
      });
    }

    account.isActive =
      !account.isActive;

    await account.save();

    res.json({
      user: account.toSafeObject(),
      message:
        `Account ${account.isActive ? "enabled" : "disabled"} successfully.`
    });
  })
);

router.get(
  "/jobs",
  asyncHandler(async (_req, res) => {
    const jobs = await Job.findAll({
      include: [
        {
          model: Recruiter,
          as: "employer",
          attributes: [
            "id",
            "name",
            "email",
            "companyName"
          ]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    const items =
      jobs.map((job) => {
        const obj =
          job.toJSON();

        if (obj.employer) {
          obj.employer.employerProfile = {
            companyName:
              obj.employer.companyName || ""
          };

          delete obj.employer.companyName;
        }

        obj.salaryRange = {
          min: obj.salaryMin || 0,
          max: obj.salaryMax || 0
        };

        delete obj.salaryMin;
        delete obj.salaryMax;

        return obj;
      });

    res.json({ items });
  })
);

router.put(
  "/jobs/:id/status",
  asyncHandler(async (req, res) => {
    const status =
      String(req.body.status || "");

    if (!JOB_STATUSES.includes(status)) {
      return res.status(400).json({
        message: "Invalid job status."
      });
    }

    const job =
      await Job.findByPk(req.params.id);

    if (!job) {
      return res.status(404).json({
        message: "Job not found."
      });
    }

    job.status = status;
    await job.save();

    res.json({
      job,
      message:
        "Job moderation status updated successfully."
    });
  })
);

export default router;
