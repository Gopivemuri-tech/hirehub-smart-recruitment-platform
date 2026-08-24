import express from "express";
import { Op } from "sequelize";

import { Recruiter, Job, Application } from "../models/index.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { autoApplyForJob } from "../services/matchingEngine.js";
import {
  JOB_STATUSES,
  JOB_TYPES,
  parseSkills,
  salaryValues
} from "../utils/validators.js";

const router = express.Router();
const EXPERIENCE_LEVELS = ["Fresher", "0-1 years", "1-3 years", "3+ years"];

function jobPayload(body, user) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const location = String(body.location || "").trim();
  const type = String(body.type || "");
  const experienceLevel = EXPERIENCE_LEVELS.includes(body.experienceLevel)
    ? body.experienceLevel
    : "Fresher";

  if (!title || !description || !location) {
    const error = new Error("Title, description, and location are required.");
    error.status = 400;
    throw error;
  }

  if (!JOB_TYPES.includes(type)) {
    const error = new Error("Select a valid job type.");
    error.status = 400;
    throw error;
  }

  const salary = salaryValues(body);

  return {
    title,
    description,
    location,
    skills: parseSkills(body.skills),
    type,
    experienceLevel,
    salaryMin: salary.min,
    salaryMax: salary.max,
    companyName: user.companyName || user.name
  };
}

function serializeJob(job) {
  const obj = job.toJSON ? job.toJSON() : job;

  return {
    ...obj,
    salaryRange: {
      min: obj.salaryMin || 0,
      max: obj.salaryMax || 0
    },
    salaryMin: undefined,
    salaryMax: undefined
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const location = String(req.query.location || "").trim();
  const type = String(req.query.type || "");
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(30, Math.max(1, Number(req.query.limit || 9)));

  const where = { status: "active" };

  if (q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${q}%` } },
      { description: { [Op.like]: `%${q}%` } },
      { companyName: { [Op.like]: `%${q}%` } }
    ];
  }

  if (location) {
    where.location = { [Op.like]: `%${location}%` };
  }

  if (JOB_TYPES.includes(type)) {
    where.type = type;
  }

  const result = await Job.findAndCountAll({
    where,
    include: [
      {
        model: Recruiter,
        as: "employer",
        attributes: ["id", "name", "companyName", "companyWebsite", "companyDescription"]
      }
    ],
    order: [["createdAt", "DESC"]],
    offset: (page - 1) * limit,
    limit,
    distinct: true
  });

  res.json({
    items: result.rows.map(serializeJob),
    pagination: {
      page,
      limit,
      total: result.count,
      pages: Math.max(1, Math.ceil(result.count / limit))
    }
  });
}));

router.get("/employer/mine",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const jobs = await Job.findAll({
      where: { recruiterId: req.user.id },
      include: [
        {
          model: Application,
          as: "applications",
          attributes: ["id"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    const items = jobs.map((job) => {
      const obj = serializeJob(job);
      obj.applicantCount = obj.applications?.length || 0;
      delete obj.applications;
      return obj;
    });

    res.json({ items });
  })
);

router.get("/:id", asyncHandler(async (req, res) => {
  const job = await Job.findByPk(req.params.id, {
    include: [
      {
        model: Recruiter,
        as: "employer",
        attributes: ["id", "name", "companyName", "companyWebsite", "companyDescription"]
      }
    ]
  });

  if (!job) {
    return res.status(404).json({ message: "Job not found." });
  }

  const obj = serializeJob(job);

  if (obj.employer) {
    obj.employer.employerProfile = {
      companyName: obj.employer.companyName || "",
      companyWebsite: obj.employer.companyWebsite || "",
      companyDescription: obj.employer.companyDescription || ""
    };

    delete obj.employer.companyName;
    delete obj.employer.companyWebsite;
    delete obj.employer.companyDescription;
  }

  res.json({ job: obj });
}));

router.post("/",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const payload = jobPayload(req.body, req.user);

    const job = await Job.create({
      ...payload,
      recruiterId: req.user.id,
      status: "active"
    });

    const autoApply = await autoApplyForJob(job);

    res.status(201).json({
      job: serializeJob(job),
      autoApply
    });
  })
);

router.put("/:id",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({
      where: {
        id: req.params.id,
        recruiterId: req.user.id
      }
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found or not owned by you."
      });
    }

    Object.assign(job, jobPayload(req.body, req.user));

    if (req.body.status && JOB_STATUSES.includes(req.body.status)) {
      job.status = req.body.status;
    }

    await job.save();

    const autoApply = job.status === "active"
      ? await autoApplyForJob(job)
      : { created: 0, candidatesChecked: 0 };

    res.json({
      job: serializeJob(job),
      autoApply
    });
  })
);

router.delete("/:id",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({
      where: {
        id: req.params.id,
        recruiterId: req.user.id
      }
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found or not owned by you."
      });
    }

    const applicationCount = await Application.count({
      where: { jobId: job.id }
    });

    if (applicationCount > 0) {
      return res.status(409).json({
        message: "This job already has applications. Close it instead of deleting it."
      });
    }

    await job.destroy();
    res.json({ message: "Job deleted." });
  })
);

export default router;
