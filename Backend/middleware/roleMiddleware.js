function isStaffRole(role) {
  return ["admin", "staff"].includes(role);
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (roles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({ message: "Permission denied" });
  };
}

module.exports = {
  isStaffRole,
  requireRoles,
};
