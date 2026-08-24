import crypto from "node:crypto";
import { Op } from "sequelize";

import { ExternalApplication } from "../models/index.js";
import { ensureExternalApplicationsSchema } from "../schemaManager.js";

export const EXTERNAL_APPLICATION_STATUSES = [
  "saved",
  "ready_to_apply",
  "applied",
  "shortlisted",
  "interview",
  "rejected",
  "selected",
  "skipped"
];

const PROTECTED_AFTER_APPLY = new Set([
  "applied",
  "shortlisted",
  "interview",
  "rejected",
  "selected"
]);

const REPAIRABLE_DATABASE_CODES = new Set([
  "ER_NO_SUCH_TABLE",
  "ER_BAD_FIELD_ERROR",
  "WARN_DATA_TRUNCATED",
  "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD",
  "ER_DATA_TOO_LONG"
]);

let repairPromise = null;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function limit(value, max) {
  return clean(value).slice(0, max);
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function databaseCode(error) {
  return (
    error?.original?.code ||
    error?.parent?.code ||
    error?.code ||
    ""
  );
}

function isRepairableDatabaseError(error) {
  return (
    error?.name === "SequelizeDatabaseError" ||
    REPAIRABLE_DATABASE_CODES.has(databaseCode(error))
  );
}

async function repairExternalSchemaOnce() {
  if (!repairPromise) {
    repairPromise = ensureExternalApplicationsSchema()
      .finally(() => {
        repairPromise = null;
      });
  }

  return repairPromise;
}

async function withExternalSchemaRepair(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!isRepairableDatabaseError(error)) {
      throw error;
    }

    console.warn(
      `External application schema mismatch detected (${databaseCode(error) || error.message}). Repairing automatically...`
    );

    await repairExternalSchemaOnce();
    return operation();
  }
}

export function buildExternalJobKey(job = {}) {
  const externalId = clean(job.externalId || job.id);

  const identity = externalId
    ? `id:${externalId}`
    : [
        normalize(job.title),
        normalize(job.companyName),
        normalize(job.location)
      ].join("|");

  return crypto
    .createHash("sha256")
    .update(identity)
    .digest("hex");
}

export function normalizeExternalSnapshot(job = {}) {
  const applyOptions = Array.isArray(job.applyOptions)
    ? job.applyOptions
        .filter((item) => item && item.url)
        .slice(0, 8)
        .map((item) => ({
          source: limit(item.source || job.source || "external", 80).toLowerCase(),
          sourceLabel: limit(
            item.sourceLabel || item.title || job.sourceLabel || "External",
            160
          ),
          title: limit(item.title || item.sourceLabel || "", 160),
          url: limit(item.url, 5000)
        }))
    : [];

  const directApplyUrl = limit(job.applyUrl, 5000);

  return {
    externalJobKey: buildExternalJobKey(job),
    externalId: limit(job.externalId || job.id, 4000) || null,
    jobTitle: limit(job.title, 255) || "External Job",
    companyName: limit(job.companyName, 255) || "External Employer",
    location: limit(job.location, 255) || "India",
    source: limit(job.source || "external", 80).toLowerCase(),
    sourceLabel: limit(job.sourceLabel || job.source || "External", 160),
    applyUrl: directApplyUrl || applyOptions[0]?.url || "",
    applyOptions: applyOptions.length ? applyOptions : null,
    matchScore: Math.max(
      0,
      Math.min(
        100,
        Number(job.match?.score ?? job.matchScore ?? 0) || 0
      )
    )
  };
}

export function trackingObject(row) {
  if (!row) return null;

  const obj = row.toJSON ? row.toJSON() : row;

  return {
    id: obj.id,
    status: obj.status,
    source: obj.source,
    sourceLabel: obj.sourceLabel,
    appliedAt: obj.appliedAt,
    updatedAt: obj.updatedAt
  };
}

export async function getExternalApplicationsForUser(jobseekerId) {
  return withExternalSchemaRepair(() =>
    ExternalApplication.findAll({
      where: { jobseekerId },
      order: [["updatedAt", "DESC"]]
    })
  );
}

export async function findExternalApplicationForUser({
  id,
  jobseekerId
}) {
  return withExternalSchemaRepair(() =>
    ExternalApplication.findOne({
      where: {
        id,
        jobseekerId
      }
    })
  );
}

export async function saveExternalApplication(row) {
  return withExternalSchemaRepair(() => row.save());
}

export async function decorateExternalJobsForUser(
  jobseekerId,
  jobs = []
) {
  if (!jobseekerId || !jobs.length) return jobs;

  const keyedJobs = jobs.map((job) => ({
    job,
    key: buildExternalJobKey(job)
  }));

  const keys = [...new Set(keyedJobs.map((item) => item.key))];

  const rows = await withExternalSchemaRepair(() =>
    ExternalApplication.findAll({
      where: {
        jobseekerId,
        externalJobKey: { [Op.in]: keys }
      }
    })
  );

  const byKey = new Map(
    rows.map((row) => [row.externalJobKey, row])
  );

  return keyedJobs.map(({ job, key }) => ({
    ...job,
    tracking: trackingObject(byKey.get(key))
  }));
}

export async function trackExternalJob({
  user,
  job,
  status
}) {
  if (!user?.id) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  if (!EXTERNAL_APPLICATION_STATUSES.includes(status)) {
    const error = new Error("Invalid external application status.");
    error.status = 400;
    throw error;
  }

  const snapshot = normalizeExternalSnapshot(job);

  if (!snapshot.applyUrl) {
    const error = new Error("External application link is missing.");
    error.status = 400;
    throw error;
  }

  return withExternalSchemaRepair(async () => {
    let row = await ExternalApplication.findOne({
      where: {
        jobseekerId: user.id,
        externalJobKey: snapshot.externalJobKey
      }
    });

    if (!row) {
      try {
        return await ExternalApplication.create({
          jobseekerId: user.id,
          ...snapshot,
          status,
          appliedAt: status === "applied" ? new Date() : null,
          lastSeenAt: new Date()
        });
      } catch (error) {
        /*
          The same external job can appear twice through different search
          cards. If two clicks race, the unique key may be inserted by the
          other request first. Re-read that row instead of showing a false
          duplicate error to the user.
        */
        if (
          error?.name !== "SequelizeUniqueConstraintError" &&
          databaseCode(error) !== "ER_DUP_ENTRY"
        ) {
          throw error;
        }

        row = await ExternalApplication.findOne({
          where: {
            jobseekerId: user.id,
            externalJobKey: snapshot.externalJobKey
          }
        });

        if (!row) {
          throw error;
        }
      }
    }

    const currentStatus = row.status;
    const shouldProtect =
      PROTECTED_AFTER_APPLY.has(currentStatus) &&
      ["saved", "ready_to_apply"].includes(status);

    row.externalId = snapshot.externalId;
    row.jobTitle = snapshot.jobTitle;
    row.companyName = snapshot.companyName;
    row.location = snapshot.location;
    row.source = snapshot.source;
    row.sourceLabel = snapshot.sourceLabel;
    row.applyUrl = snapshot.applyUrl;
    row.applyOptions = snapshot.applyOptions;
    row.matchScore = snapshot.matchScore;
    row.lastSeenAt = new Date();

    if (!shouldProtect) {
      row.status = status;
    }

    if (status === "applied" && !row.appliedAt) {
      row.appliedAt = new Date();
    }

    await row.save();
    return row;
  });
}
