import {
  DatabaseError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError
} from "sequelize";

export function notFound(req, res) {
  res.status(404).json({
    message:
      `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(
  error,
  _req,
  res,
  _next
) {
  console.error(error);

  if (
    error instanceof
    UniqueConstraintError
  ) {
    return res
      .status(409)
      .json({
        message:
          "This job is already saved/tracked for your account."
      });
  }

  if (
    error instanceof
    ForeignKeyConstraintError
  ) {
    return res
      .status(409)
      .json({
        message:
          "This action conflicts with related HireHub data."
      });
  }

  if (
    error instanceof
    ValidationError
  ) {
    return res
      .status(400)
      .json({
        message:
          error.errors?.[0]?.message ||
          "Validation failed."
      });
  }

  if (
    error instanceof
    DatabaseError
  ) {
    const detail =
      error?.original?.sqlMessage ||
      error?.parent?.sqlMessage ||
      error.message ||
      "Database operation failed.";

    return res
      .status(503)
      .json({
        message:
          "HireHub could not complete this database action. The external-application schema is repaired automatically; restart the app once only if this message persists.",
        code: "DATABASE_ERROR",
        ...(process.env.NODE_ENV === "production" ? {} : { detail })
      });
  }

  if (
    error.name ===
    "MulterError"
  ) {
    return res
      .status(400)
      .json({
        message:
          error.message
      });
  }

  res
    .status(
      error.status ||
      500
    )
    .json({
      message:
        error.message ||
        "Unexpected server error."
    });
}
