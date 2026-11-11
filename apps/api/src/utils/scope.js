// Owners and admins see every course and class in the school. A lecturer (manager role) sees only their own.
export const seesAll = (user) => user.role === 'owner' || user.role === 'admin';
export const courseScope = (user) => (seesAll(user) ? {} : { createdBy: user._id });
export const sessionScope = (user) => (seesAll(user) ? {} : { startedBy: user._id });
