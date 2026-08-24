import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.resolve("uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80);

    cb(null, `${Date.now()}-${safeName}${extension}`);
  }
});

const accepted = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export const resumeUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!accepted.has(file.mimetype)) {
      return cb(new Error("Resume must be PDF, DOC, or DOCX."));
    }

    cb(null, true);
  }
});
