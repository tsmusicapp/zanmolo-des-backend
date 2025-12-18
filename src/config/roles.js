const allRoles = {
  user: ['user'],
  recruiter: ['recruiter'],
  admin: ['admin'],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

module.exports = {
  roles,
  roleRights,
};
