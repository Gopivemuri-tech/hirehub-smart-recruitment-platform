export function getProfileReadiness(user) {
  const checks = [
    { key: "resume", label: "Upload Master Resume", weight: 25, ready: Boolean(user?.resumePath) },
    { key: "headline", label: "Add professional headline", weight: 10, ready: Boolean(String(user?.headline || "").trim()) },
    { key: "location", label: "Add profile location", weight: 10, ready: Boolean(String(user?.profileLocation || "").trim()) },
    { key: "skills", label: "Add at least 3 skills", weight: 20, ready: Array.isArray(user?.skills) && user.skills.filter(Boolean).length >= 3 },
    { key: "bio", label: "Add profile summary", weight: 10, ready: String(user?.bio || "").trim().length >= 20 },
    { key: "experience", label: "Set experience level", weight: 5, ready: Boolean(String(user?.experienceLevel || "").trim()) },
    { key: "roles", label: "Add preferred role", weight: 10, ready: Array.isArray(user?.preferredRoles) && user.preferredRoles.filter(Boolean).length > 0 },
    { key: "locations", label: "Add preferred location", weight: 5, ready: Array.isArray(user?.preferredLocations) && user.preferredLocations.filter(Boolean).length > 0 },
    { key: "types", label: "Choose preferred job type", weight: 5, ready: Array.isArray(user?.preferredJobTypes) && user.preferredJobTypes.filter(Boolean).length > 0 }
  ];

  const score = checks.reduce((total, item) => total + (item.ready ? item.weight : 0), 0);

  return {
    score,
    complete: score === 100,
    resumeUploaded: Boolean(user?.resumePath),
    checks,
    missing: checks.filter((item) => !item.ready).map((item) => item.label)
  };
}
