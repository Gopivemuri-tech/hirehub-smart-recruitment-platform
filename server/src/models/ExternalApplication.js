import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const EXTERNAL_APPLICATION_STATUSES = [
  "saved",
  "ready_to_apply",
  "applied",
  "shortlisted",
  "interview",
  "rejected",
  "selected",
  "skipped"
];

const ExternalApplication = sequelize.define(
  "external_applications",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    jobseekerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "jobseeker_id"
    },
    externalJobKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "external_job_key"
    },
    externalId: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "external_id"
    },
    jobTitle: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "job_title"
    },
    companyName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
      field: "company_name"
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: ""
    },
    source: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: "external"
    },
    sourceLabel: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: "External",
      field: "source_label"
    },
    applyUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "apply_url"
    },
    applyOptions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
      field: "apply_options"
    },
    matchScore: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: "match_score"
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "saved",
      validate: {
        isIn: [EXTERNAL_APPLICATION_STATUSES]
      }
    },
    appliedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "applied_at"
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "last_seen_at"
    }
  },
  {
    indexes: [
      {
        unique: true,
        name: "unique_external_job_candidate",
        fields: ["jobseeker_id", "external_job_key"]
      },
      { fields: ["jobseeker_id"] },
      { fields: ["status"] },
      { fields: ["source"] },
      { fields: ["match_score"] }
    ]
  }
);

export default ExternalApplication;
