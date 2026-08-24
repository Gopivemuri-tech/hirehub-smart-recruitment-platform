import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Job = sequelize.define(
  "jobs",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    recruiterId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "recruiter_id"
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT("long"),
      allowNull: false
    },
    location: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    skills: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    type: {
      type: DataTypes.ENUM(
        "Full-time",
        "Part-time",
        "Internship",
        "Contract",
        "Remote"
      ),
      allowNull: false
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
    salaryMin: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: "salary_min"
    },
    salaryMax: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: "salary_max"
    },
    companyName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: "",
      field: "company_name"
    },
    status: {
      type: DataTypes.ENUM("active", "closed"),
      allowNull: false,
      defaultValue: "active"
    }
  },
  {
    indexes: [
      { fields: ["recruiter_id"] },
      { fields: ["status"] },
      { fields: ["location"] },
      { fields: ["type"] },
      { fields: ["experience_level"] },
      { fields: ["created_at"] }
    ]
  }
);

Job.prototype.toApiObject = function () {
  const obj = this.toJSON();

  obj.salaryRange = {
    min: obj.salaryMin || 0,
    max: obj.salaryMax || 0
  };

  delete obj.salaryMin;
  delete obj.salaryMax;

  return obj;
};

export default Job;
