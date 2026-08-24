import jwt from "jsonwebtoken";

export function signToken(account, role) {
  if (!account?.id || !role) {
    throw new Error("Unable to create login token.");
  }

  return jwt.sign(
    {
      sub: String(account.id),
      role: String(role)
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        "7d"
    }
  );
}
