import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Jobseeker = sequelize.define(
  "jobseekers",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(190),
      allowNull: false,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "password_hash"
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active"
    },

    headline: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: ""
    },
    profileLocation: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "",
      field: "profile_location"
    },
    skills: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: ""
    },
    experienceLevel: {
      type: DataTypes.ENUM(
        "Fresher",
        "0-1 years",
        "1-3 years",
        "3+ years"
      ),
      allowNull: false,
      defaultValue: "Fresher",
      field: "experience_level"
    },

    resumePath: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "resume_path"
    },
    originalResumeName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "original_resume_name"
    },

    preferredRoles: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: "preferred_roles"
    },
    preferredLocations: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: "preferred_locations"
    },
    preferredJobTypes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: "preferred_job_types"
    },
    autoApplyEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "auto_apply_enabled"
    },
    minMatchScore: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 70,
      field: "min_match_score"
    },
    maxAutoApplicationsPerDay: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 10,
      field: "max_auto_applications_per_day"
    },

    role: {
      type: DataTypes.VIRTUAL,
      get() {
        return "jobseeker";
      }
    }
  },
  {
    indexes: [
      { unique: true, fields: ["email"] },
      { fields: ["is_active"] },
      { fields: ["auto_apply_enabled"] }
    ]
  }
);

Jobseeker.prototype.toSafeObject = function () {
  const obj = this.toJSON();
  delete obj.passwordHash;

  return {
    id: obj.id,
    name: obj.name,
    email: obj.email,
    isActive: obj.isActive,
    role: "jobseeker",
    jobseekerProfile: {
      headline: obj.headline || "",
      location: obj.profileLocation || "",
      skills: obj.skills || [],
      bio: obj.bio || "",
      experienceLevel: obj.experienceLevel || "Fresher",
      preferredRoles: obj.preferredRoles || [],
      preferredLocations: obj.preferredLocations || [],
      preferredJobTypes: obj.preferredJobTypes || [],
      autoApplyEnabled: Boolean(obj.autoApplyEnabled),
      minMatchScore: Number(obj.minMatchScore || 70),
      maxAutoApplicationsPerDay: Number(obj.maxAutoApplicationsPerDay || 10),
      resumeUploaded: Boolean(obj.resumePath),
      originalResumeName: obj.originalResumeName || ""
    },
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

export default Jobseeker;
