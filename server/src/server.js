import "dotenv/config";

import express from "express";
import cors from "cors";
import morgan from "morgan";

import {
  ensureFinalSchema
} from "./schemaManager.js";

import authRoutes from "./routes/auth.js";
import jobRoutes from "./routes/jobs.js";
import applicationRoutes from "./routes/applications.js";
import adminRoutes from "./routes/admin.js";
import autoApplyRoutes from "./routes/autoApply.js";
import externalJobsRoutes from "./routes/externalJobs.js";
import externalApplicationsRoutes from "./routes/externalApplications.js";
import jobseekerCenterRoutes from "./routes/jobseekerCenter.js";

import {
  errorHandler,
  notFound
} from "./middleware/errorHandler.js";

const app =
  express();

const port =
  Number(
    process.env.PORT ||
    5000
  );

if (
  !process.env.JWT_SECRET
) {
  console.error(
    "JWT_SECRET is missing in server/.env"
  );
  process.exit(1);
}

app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:5173"
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(morgan("dev"));

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      ok: true,
      service: "HireHub API",
      version: "CLOSED-FIX-FK-METADATA",
      database: "MySQL"
    });
  }
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/jobs",
  jobRoutes
);

app.use(
  "/api/applications",
  applicationRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/auto-apply",
  autoApplyRoutes
);

app.use(
  "/api/external-jobs",
  externalJobsRoutes
);

app.use(
  "/api/external-applications",
  externalApplicationsRoutes
);

app.use(
  "/api/jobseeker-center",
  jobseekerCenterRoutes
);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    console.log(
      "Preparing HireHub database (closed FK metadata fix)..."
    );

    await ensureFinalSchema();

    app.listen(
      port,
      () => {
        console.log(
          `HireHub API: http://localhost:${port}`
        );
      }
    );
  } catch (error) {
    console.error("");
    console.error(
      "HireHub database setup failed:"
    );
    console.error(
      error.message
    );
    console.error("");
    console.error(
      "The API was not started with a broken schema."
    );
    process.exit(1);
  }
}

start();