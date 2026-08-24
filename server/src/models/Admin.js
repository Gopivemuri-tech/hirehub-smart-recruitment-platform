import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const Admin = sequelize.define(
  "admins",
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
    role: {
      type: DataTypes.VIRTUAL,
      get() {
        return "admin";
      }
    }
  },
  {
    indexes: [
      { unique: true, fields: ["email"] },
      { fields: ["is_active"] }
    ]
  }
);

Admin.prototype.toSafeObject = function () {
  const obj = this.toJSON();
  delete obj.passwordHash;

  return {
    ...obj,
    role: "admin"
  };
};

export default Admin;
