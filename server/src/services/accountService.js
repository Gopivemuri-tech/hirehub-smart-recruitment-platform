import {
  Admin,
  Recruiter,
  Jobseeker
} from "../models/index.js";

const MODEL_BY_ROLE = {
  admin: Admin,
  employer: Recruiter,
  jobseeker: Jobseeker
};

export function modelForRole(role) {
  return MODEL_BY_ROLE[role] || null;
}

export async function findAccountByRoleAndId(role, id) {
  const Model = modelForRole(role);
  if (!Model) return null;
  return Model.findByPk(id);
}

export async function findAccountByEmail(email) {
  const searches = [
    ["admin", Admin],
    ["employer", Recruiter],
    ["jobseeker", Jobseeker]
  ];

  let schemaError = null;

  for (const [role, Model] of searches) {
    try {
      const account =
        await Model.findOne({
          where: { email }
        });

      if (account) {
        return { account, role };
      }
    } catch (error) {
      schemaError = error;
    }
  }

  if (schemaError) {
    const error =
      new Error(
        "HireHub database schema is incomplete. Restart HireHub using START_HIREHUB.bat so the database setup can finish."
      );

    error.status = 503;
    error.cause = schemaError;
    throw error;
  }

  return null;
}

export async function emailExistsAnywhere(email) {
  const searches = [
    Admin,
    Recruiter,
    Jobseeker
  ];

  for (const Model of searches) {
    const count =
      await Model.count({
        where: { email }
      });

    if (count > 0) {
      return true;
    }
  }

  return false;
}
