import express from "express";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import zlib from "zlib";

import {
  Admin,
  Recruiter,
  Jobseeker
} from "../models/index.js";

import {
  requireAuth,
  allowRoles
} from "../middleware/auth.js";

import {
  resumeUpload
} from "../middleware/upload.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  signToken
} from "../utils/token.js";

import {
  autoApplyForUser
} from "../services/matchingEngine.js";

import {
  emailExistsAnywhere,
  findAccountByEmail
} from "../services/accountService.js";

import {
  normalizeEmail,
  parseSkills,
  PUBLIC_ROLES,
  validEmail
} from "../utils/validators.js";

const router = express.Router();

function asList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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
  const minimumOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;

  for (
    let offset = buffer.length - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
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

  throw new Error(
    "word/document.xml was not found in the DOCX file."
  );
}

function extractDocxText(filePath) {
  return docxXmlToText(
    extractDocxDocumentXml(filePath)
  );
}

function masterResumePath(user) {
  if (!user?.resumePath) return "";
  return path.resolve("uploads", user.resumePath);
}

function safeInlineFilename(value) {
  return String(value || "resume")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 180);
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required."
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (!PUBLIC_ROLES.includes(role)) {
      return res.status(400).json({
        message: "Account type must be Candidate or Recruiter."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters."
      });
    }

    if (await emailExistsAnywhere(email)) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const account =
      role === "employer"
        ? await Recruiter.create({
            name,
            email,
            passwordHash
          })
        : await Jobseeker.create({
            name,
            email,
            passwordHash
          });

    res.status(201).json({
      token: signToken(account, role),
      user: account.toSafeObject()
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const found = await findAccountByEmail(email);

    if (!found) {
      return res.status(401).json({
        message: "Account not found. Create an account first or use the email registered in HireHub."
      });
    }

    if (
      !(await bcrypt.compare(
        password,
        found.account.passwordHash
      ))
    ) {
      return res.status(401).json({
        message: "Incorrect password."
      });
    }

    if (!found.account.isActive) {
      return res.status(403).json({
        message: "Your account is disabled."
      });
    }

    res.json({
      token: signToken(found.account, found.role),
      user: found.account.toSafeObject()
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      user: req.user.toSafeObject()
    });
  })
);

router.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const role = req.authRole;
    const name = String(req.body.name || "").trim();

    if (name) {
      req.user.name = name;
    }

    if (role === "jobseeker") {
      const profile = req.body.jobseekerProfile || {};

      req.user.headline =
        String(profile.headline || "").trim();

      req.user.profileLocation =
        String(profile.location || "").trim();

      req.user.skills =
        parseSkills(profile.skills);

      req.user.bio =
        String(profile.bio || "").trim();

      const allowedExperience = [
        "Fresher",
        "0-1 years",
        "1-3 years",
        "3+ years"
      ];

      req.user.experienceLevel =
        allowedExperience.includes(profile.experienceLevel)
          ? profile.experienceLevel
          : "Fresher";

      req.user.preferredRoles =
        asList(profile.preferredRoles);

      req.user.preferredLocations =
        asList(profile.preferredLocations);

      const allowedJobTypes = [
        "Full-time",
        "Part-time",
        "Internship",
        "Contract",
        "Remote"
      ];

      req.user.preferredJobTypes =
        asList(profile.preferredJobTypes)
          .filter((item) =>
            allowedJobTypes.includes(item)
          );

      req.user.autoApplyEnabled =
        Boolean(profile.autoApplyEnabled);

      req.user.minMatchScore =
        Math.min(
          100,
          Math.max(
            30,
            Number(profile.minMatchScore || 70)
          )
        );

      req.user.maxAutoApplicationsPerDay =
        Math.min(
          50,
          Math.max(
            1,
            Number(
              profile.maxAutoApplicationsPerDay || 10
            )
          )
        );
    }

    if (role === "employer") {
      const profile = req.body.employerProfile || {};

      req.user.companyName =
        String(profile.companyName || "").trim();

      req.user.companyWebsite =
        String(profile.companyWebsite || "").trim();

      req.user.companyDescription =
        String(profile.companyDescription || "").trim();
    }

    await req.user.save();

    let autoApply = null;

    if (
      role === "jobseeker" &&
      req.user.autoApplyEnabled &&
      req.user.resumePath
    ) {
      autoApply = await autoApplyForUser(req.user);
    }

    let message =
      "Your details have been updated successfully.";

    if (role === "jobseeker") {
      message = autoApply?.created
        ? `Your candidate profile was saved. HireHub automatically applied to ${autoApply.created} matching job(s).`
        : "Your candidate profile and Auto-Apply preferences were saved successfully.";
    } else if (role === "employer") {
      message =
        "Recruiter profile updated successfully.";
    } else if (role === "admin") {
      message =
        "Platform owner profile updated successfully.";
    }

    res.json({
      user: req.user.toSafeObject(),
      autoApply,
      message
    });
  })
);

router.post(
  "/resume",
  requireAuth,
  allowRoles("jobseeker"),
  resumeUpload.single("resume"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Select a resume file."
      });
    }

    const hadResume = Boolean(req.user.resumePath);

    req.user.resumePath =
      req.file.filename;

    req.user.originalResumeName =
      req.file.originalname;

    await req.user.save();

    let autoApply = null;

    if (req.user.autoApplyEnabled) {
      autoApply =
        await autoApplyForUser(req.user);
    }

    res.json({
      message: autoApply?.created
        ? `Master Resume ${hadResume ? "updated" : "uploaded"}. HireHub automatically applied to ${autoApply.created} matching job(s).`
        : hadResume
          ? "Master Resume updated successfully."
          : "Master Resume uploaded successfully.",
      user: req.user.toSafeObject(),
      autoApply
    });
  })
);

router.get(
  "/resume/preview",
  requireAuth,
  allowRoles("jobseeker"),
  asyncHandler(async (req, res) => {
    if (!req.user.resumePath) {
      return res.status(404).json({
        message: "No Master Resume uploaded."
      });
    }

    const filePath = masterResumePath(req.user);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Resume file is missing."
      });
    }

    const extension = path
      .extname(
        req.user.originalResumeName ||
        req.user.resumePath ||
        ""
      )
      .toLowerCase();

    if (extension === ".pdf") {
      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeInlineFilename(
          req.user.originalResumeName || "resume.pdf"
        )}"`
      );

      return res.sendFile(filePath);
    }

    if (extension === ".docx") {
      let text = "";

      try {
        text = extractDocxText(filePath);
      } catch (_error) {
        return res.status(422).json({
          message:
            "This DOCX resume could not be previewed. Upload the file again or use PDF."
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
        "Legacy DOC files cannot be previewed directly. Update the Master Resume with PDF or DOCX to use View."
    });
  })
);

router.get(
  "/resume",
  requireAuth,
  allowRoles("jobseeker"),
  asyncHandler(async (req, res) => {
    if (!req.user.resumePath) {
      return res.status(404).json({
        message: "No Master Resume uploaded."
      });
    }

    const filePath = masterResumePath(req.user);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Resume file is missing."
      });
    }

    res.download(
      filePath,
      req.user.originalResumeName || "resume"
    );
  })
);

export default router;
