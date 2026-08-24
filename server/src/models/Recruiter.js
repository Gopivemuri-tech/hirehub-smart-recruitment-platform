import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Recruiter = sequelize.define(
  "recruiters",
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
    companyName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: "",
      field: "company_name"
    },
    companyWebsite: {
      type: DataTypes.STRING(250),
      allowNull: false,
      defaultValue: "",
      field: "company_website"
    },
    companyDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
      field: "company_description"
    },
    role: {
      type: DataTypes.VIRTUAL,
      get() {
        return "employer";
      }
    }
  },
  {
    indexes: [
      { unique: true, fields: ["email"] },
      { fields: ["is_active"] },
      { fields: ["company_name"] }
    ]
  }
);

Recruiter.prototype.toSafeObject = function () {
  const obj = this.toJSON();
  delete obj.passwordHash;

  return {
    id: obj.id,
    name: obj.name,
    email: obj.email,
    isActive: obj.isActive,
    role: "employer",
    employerProfile: {
      companyName: obj.companyName || "",
      companyWebsite: obj.companyWebsite || "",
      companyDescription: obj.companyDescription || ""
    },
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

export default Recruiter;
