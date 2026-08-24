import Admin from "./Admin.js";
import Recruiter from "./Recruiter.js";
import Jobseeker from "./Jobseeker.js";
import Job from "./Job.js";
import Application from "./Application.js";
import ExternalApplication from "./ExternalApplication.js";

Recruiter.hasMany(Job, {
  foreignKey: "recruiterId",
  as: "jobs",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE"
});

Job.belongsTo(Recruiter, {
  foreignKey: "recruiterId",
  as: "employer"
});

Jobseeker.hasMany(Application, {
  foreignKey: "jobseekerId",
  as: "applications",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE"
});

Application.belongsTo(Jobseeker, {
  foreignKey: "jobseekerId",
  as: "jobseeker"
});

Job.hasMany(Application, {
  foreignKey: "jobId",
  as: "applications",
  onDelete: "CASCADE",
  onUpdate: "CASCADE"
});

Application.belongsTo(Job, {
  foreignKey: "jobId",
  as: "job"
});

Jobseeker.hasMany(ExternalApplication, {
  foreignKey: "jobseekerId",
  as: "externalApplications",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE"
});

ExternalApplication.belongsTo(Jobseeker, {
  foreignKey: "jobseekerId",
  as: "jobseeker"
});

export {
  Admin,
  Recruiter,
  Jobseeker,
  Job,
  Application,
  ExternalApplication
};
