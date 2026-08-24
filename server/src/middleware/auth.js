import jwt from "jsonwebtoken";
import {
  findAccountByRoleAndId
} from "../services/accountService.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication required."
      });
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await findAccountByRoleAndId(
      payload.role,
      payload.sub
    );

    if (!user) {
      return res.status(401).json({
        message: "Account no longer exists."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Your account is disabled."
      });
    }

    req.user = user;
    req.authRole = payload.role;

    next();
  } catch (_error) {
    return res.status(401).json({
      message: "Invalid or expired authentication token."
    });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header) {
      return next();
    }

    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return next();
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await findAccountByRoleAndId(
      payload.role,
      payload.sub
    );

    if (user && user.isActive) {
      req.user = user;
      req.authRole = payload.role;
    }

    return next();
  } catch (_error) {
    // Public external-job browsing must continue even when an old token exists.
    return next();
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    const role = req.authRole || req.user?.role;

    if (!req.user || !roles.includes(role)) {
      return res.status(403).json({
        message: "You do not have permission for this action."
      });
    }

    next();
  };
}