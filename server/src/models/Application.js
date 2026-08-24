import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Application = sequelize.define(
  "applications",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    jobId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "job_id"
    },
    jobseekerId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "jobseeker_id"
    },
    resumePath: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "resume_path"
    },
    originalResumeName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "original_resume_name"
    },
    coverLetter: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
      field: "cover_letter"
    },
    applicationMethod: {
      type: DataTypes.ENUM("manual", "auto"),
      allowNull: false,
      defaultValue: "manual",
      field: "application_method"
    },
    matchScore: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: "match_score"
    },
    matchBreakdown: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      field: "match_breakdown"
    },
    status: {
      type: DataTypes.ENUM(
        "applied",
        "reviewing",
        "shortlisted",
        "interview",
        "selected",
        "rejected",
        "hired"
      ),
      allowNull: false,
      defaultValue: "applied"
    },
    appliedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "applied_at"
    }
  },
  {
    indexes: [
      {
        unique: true,
        name: "unique_job_jobseeker_application",
        fields: ["job_id", "jobseeker_id"]
      },
      { fields: ["job_id"] },
      { fields: ["jobseeker_id"] },
      { fields: ["status"] },
      { fields: ["application_method"] },
      { fields: ["match_score"] }
    ]
  }
);

export default Application;
