import express from "express";
import path from "path";
import fs from "fs";
import zlib from "zlib";

import { Jobseeker, Job, Application, ExternalApplication } from "../models/index.js";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APPLICATION_STATUSES } from "../utils/validators.js";
import { createApplicationFromMatch } from "../services/matchingEngine.js";

const router = express.Router();

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, num) =>
      String.fromCodePoint(parseInt(num, 10))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function docxXmlToText(xml) {
  const source = String(xml || "");
  const tokenPattern =
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<\/w:p>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/gi;

  const parts = [];
  let match;

  while ((match = tokenPattern.exec(source))) {
    const token = match[0];

    if (match[1] !== undefined) {
      parts.push(
        decodeXmlEntities(
          match[1].replace(/<[^>]+>/g, "")
        )
      );
      continue;
    }

    if (/^<\/w:p/i.test(token)) {
      parts.push("\n");
      continue;
    }

    if (/^<w:tab/i.test(token)) {
      parts.push("\t");
      continue;
    }

    parts.push("\n");
  }

  return parts
    .join("")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDocxDocumentXml(filePath) {
  const buffer = fs.readFileSync(filePath);

  // ZIP End Of Central Directory record is always within the final
  // 65,557 bytes of a normal ZIP/DOCX file.
  const minimumOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("The DOCX file is not a valid ZIP document.");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("The DOCX central directory is invalid.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = buffer
      .subarray(fileNameStart, fileNameEnd)
      .toString("utf8");

    if (fileName === "word/document.xml") {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("The DOCX local file header is invalid.");
      }

      const localFileNameLength =
        buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength =
        buffer.readUInt16LE(localHeaderOffset + 28);

      const compressedDataStart =
        localHeaderOffset +
        30 +
        localFileNameLength +
        localExtraLength;

      const compressedDataEnd =
        compressedDataStart + compressedSize;

      const compressedData =
        buffer.subarray(
          compressedDataStart,
          compressedDataEnd
        );

      if (compressionMethod === 0) {
        return compressedData.toString("utf8");
      }

      if (compressionMethod === 8) {
        return zlib
          .inflateRawSync(compressedData)
          .toString("utf8");
      }

      throw new Error(
        `Unsupported DOCX compression method: ${compressionMethod}`
      );
    }

    offset =
      fileNameEnd +
      extraLength +
      commentLength;
  }

  throw new Error("word/document.xml was not found in the DOCX file.");
}

function extractDocxText(filePath) {
  const xml = extractDocxDocumentXml(filePath);
  return docxXmlToText(xml);
}

function apiJob(job) {
  if (!job) return null;

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

router.post("/:jobId",
  requireAuth,
  allowRoles("jobseeker"),
  asyncHandler(async (req, res) => {
    const job = await Job.findByPk(req.params.jobId);

    if (!job || job.status !== "active") {
      return res.status(404).json({
        message: "Active job not found."
      });
    }

    if (!req.user.resumePath) {
      return res.status(400).json({
        message: "Upload your Master Resume in Profile before applying."
      });
    }

    const result = await createApplicationFromMatch({
      user: req.user,
      job,
      method: "manual",
      coverLetter: String(req.body.coverLetter || "").trim()
    });

    if (!result.created) {
      return res.status(409).json({
        message: result.reason === "already_applied"
          ? "You already applied to this job."
          : "Application could not be created."
      });
    }

    res.status(201).json({
      application: result.application,
      match: result.match
    });
  })
);

router.get("/mine/unified",
  requireAuth,
  allowRoles("jobseeker"),
  asyncHandler(async (req, res) => {
    const [nativeApplications, externalApplications] = await Promise.all([
      Application.findAll({
        where: { jobseekerId: req.user.id },
        include: [
          {
            model: Job,
            as: "job",
            attributes: [
              "id",
              "title",
              "companyName",
              "location",
              "type",
              "experienceLevel",
              "status",
              "salaryMin",
              "salaryMax"
            ]
          }
        ],
        order: [["appliedAt", "DESC"]]
      }),
      ExternalApplication.findAll({
        where: { jobseekerId: req.user.id },
        order: [["updatedAt", "DESC"]]
      })
    ]);

    const nativeItems = nativeApplications.map((application) => {
      const obj = application.toJSON();
      const job = apiJob(obj.job);

      return {
        id: `hirehub-${obj.id}`,
        recordId: obj.id,
        isExternal: false,
        source: "hirehub",
        sourceLabel: "HireHub",
        job,
        jobTitle: job?.title || "HireHub Job",
        companyName: job?.companyName || "Employer",
        location: job?.location || "",
        matchScore: obj.matchScore || 0,
        applicationMethod: obj.applicationMethod,
        status: obj.status,
        appliedAt: obj.appliedAt,
        updatedAt: obj.updatedAt,
        applyUrl: job?.id ? `/jobs/${job.id}` : ""
      };
    });

    const externalItems = externalApplications.map((application) => {
      const obj = application.toJSON();

      return {
        id: `external-${obj.id}`,
        recordId: obj.id,
        isExternal: true,
        source: obj.source,
        sourceLabel: obj.sourceLabel,
        job: null,
        jobTitle: obj.jobTitle,
        companyName: obj.companyName,
        location: obj.location,
        matchScore: obj.matchScore || 0,
        applicationMethod: "external",
        status: obj.status,
        appliedAt: obj.appliedAt,
        updatedAt: obj.updatedAt,
        applyUrl: obj.applyUrl,
        applyOptions: obj.applyOptions || []
      };
    });

    const items = [...nativeItems, ...externalItems].sort((a, b) => {
      const aDate = new Date(a.appliedAt || a.updatedAt || 0).getTime();
      const bDate = new Date(b.appliedAt || b.updatedAt || 0).getTime();
      return bDate - aDate;
    });

    const summary = {
      totalTracked: items.length,
      hirehubApplications: nativeItems.length,
      externalTracked: externalItems.length,
      autoApplied: nativeItems.filter((item) => item.applicationMethod === "auto").length,
      saved: externalItems.filter((item) => item.status === "saved").length,
      readyToApply: externalItems.filter((item) => item.status === "ready_to_apply").length,
      applied: items.filter((item) => item.status === "applied").length,
      shortlisted: items.filter((item) => item.status === "shortlisted").length,
      interview: items.filter((item) => item.status === "interview").length,
      selected: items.filter((item) => ["selected", "hired"].includes(item.status)).length,
      rejected: items.filter((item) => item.status === "rejected").length,
      skipped: externalItems.filter((item) => item.status === "skipped").length
    };

    res.json({ items, summary });
  })
);

router.get("/mine",
  requireAuth,
  allowRoles("jobseeker"),
  asyncHandler(async (req, res) => {
    const applications = await Application.findAll({
      where: { jobseekerId: req.user.id },
      include: [
        {
          model: Job,
          as: "job",
          attributes: [
            "id",
            "title",
            "companyName",
            "location",
            "type",
            "experienceLevel",
            "status",
            "salaryMin",
            "salaryMax"
          ]
        }
      ],
      order: [["appliedAt", "DESC"]]
    });

    const items = applications.map((application) => {
      const obj = application.toJSON();
      obj.job = apiJob(obj.job);
      return obj;
    });

    res.json({ items });
  })
);


router.get("/employer/mine",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const applications = await Application.findAll({
      include: [
        {
          model: Job,
          as: "job",
          required: true,
          where: {
            recruiterId: req.user.id
          },
          attributes: [
            "id",
            "title",
            "companyName",
            "location",
            "type",
            "status"
          ]
        },
        {
          model: Jobseeker,
          as: "jobseeker",
          attributes: [
            "id",
            "name",
            "email",
            "headline",
            "profileLocation",
            "skills",
            "bio",
            "experienceLevel"
          ]
        }
      ],
      order: [["appliedAt", "DESC"]]
    });

    const items = applications.map((application) => {
      const obj = application.toJSON();

      if (obj.jobseeker) {
        obj.jobseeker.jobseekerProfile = {
          headline: obj.jobseeker.headline || "",
          location: obj.jobseeker.profileLocation || "",
          skills: obj.jobseeker.skills || [],
          bio: obj.jobseeker.bio || "",
          experienceLevel:
            obj.jobseeker.experienceLevel || "Fresher"
        };

        delete obj.jobseeker.headline;
        delete obj.jobseeker.profileLocation;
        delete obj.jobseeker.skills;
        delete obj.jobseeker.bio;
        delete obj.jobseeker.experienceLevel;
      }

      return obj;
    });

    res.json({ items });
  })
);

router.get("/job/:jobId",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({
      where: {
        id: req.params.jobId,
        recruiterId: req.user.id
      }
    });

    if (!job) {
      return res.status(404).json({
        message: "Job not found or not owned by you."
      });
    }

    const applications = await Application.findAll({
      where: { jobId: job.id },
      include: [
        {
          model: Jobseeker,
          as: "jobseeker",
          attributes: [
            "id",
            "name",
            "email",
            "headline",
            "profileLocation",
            "skills",
            "bio",
            "experienceLevel"
          ]
        }
      ],
      order: [["matchScore", "DESC"], ["appliedAt", "DESC"]]
    });

    const items = applications.map((application) => {
      const obj = application.toJSON();

      if (obj.jobseeker) {
        obj.jobseeker.jobseekerProfile = {
          headline: obj.jobseeker.headline || "",
          location: obj.jobseeker.profileLocation || "",
          skills: obj.jobseeker.skills || [],
          bio: obj.jobseeker.bio || "",
          experienceLevel: obj.jobseeker.experienceLevel || "Fresher"
        };

        delete obj.jobseeker.headline;
        delete obj.jobseeker.profileLocation;
        delete obj.jobseeker.skills;
        delete obj.jobseeker.bio;
        delete obj.jobseeker.experienceLevel;
      }

      return obj;
    });

    res.json({
      job: apiJob(job),
      items
    });
  })
);

router.put("/:id/status",
  requireAuth,
  allowRoles("employer"),
  asyncHandler(async (req, res) => {
    const status = String(req.body.status || "");

    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        message: "Invalid application status."
      });
    }

    const application = await Application.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: "job",
          attributes: ["id", "recruiterId"]
        }
      ]
    });

    if (!application || Number(application.job.recruiterId) !== Number(req.user.id)) {
      return res.status(404).json({
        message: "Application not found."
      });
    }

    application.status = status;
    await application.save();

    res.json({
      application,
      message: "Candidate application updated successfully."
    });
  })
);

router.get("/:id/resume/preview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const application = await Application.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: "job",
          attributes: ["id", "recruiterId"]
        }
      ]
    });

    if (!application) {
      return res.status(404).json({
        message: "Application not found."
      });
    }

    const canAccess =
      (req.user.role === "jobseeker" &&
        Number(application.jobseekerId) === Number(req.user.id)) ||
      (req.user.role === "employer" &&
        Number(application.job.recruiterId) === Number(req.user.id)) ||
      req.user.role === "admin";

    if (!canAccess) {
      return res.status(403).json({
        message: "You cannot access this resume."
      });
    }

    const filePath = path.resolve("uploads", application.resumePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Resume file is missing."
      });
    }

    const originalName =
      application.originalResumeName ||
      path.basename(filePath) ||
      "resume";

    const extension =
      path.extname(originalName).toLowerCase() ||
      path.extname(filePath).toLowerCase();

    if (extension === ".pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(originalName)}`
      );

      return res.sendFile(filePath);
    }

    if (extension === ".docx") {
      let text = "";

      try {
        text = extractDocxText(filePath);
      } catch (error) {
        console.error(
          "DOCX preview extraction failed:",
          error
        );

        return res.status(422).json({
          message:
            "This DOCX resume could not be previewed. The file may be damaged or use an unsupported DOCX format."
        });
      }

      res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        "inline"
      );

      return res.send(
        text ||
          "No readable text was found in this resume."
      );
    }

    return res.status(415).json({
      message:
        "This legacy DOC resume cannot be previewed in the browser. Please ask the candidate to upload PDF or DOCX."
    });
  })
);

router.get("/:id/resume",
  requireAuth,
  asyncHandler(async (req, res) => {
    const application = await Application.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: "job",
          attributes: ["id", "recruiterId"]
        }
      ]
    });

    if (!application) {
      return res.status(404).json({
        message: "Application not found."
      });
    }

    const canAccess =
      (req.user.role === "jobseeker" && Number(application.jobseekerId) === Number(req.user.id)) ||
      (req.user.role === "employer" && Number(application.job.recruiterId) === Number(req.user.id)) ||
      req.user.role === "admin";

    if (!canAccess) {
      return res.status(403).json({
        message: "You cannot access this resume."
      });
    }

    const filePath = path.resolve("uploads", application.resumePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Resume file is missing."
      });
    }

    res.download(filePath, application.originalResumeName);
  })
);

export default router;