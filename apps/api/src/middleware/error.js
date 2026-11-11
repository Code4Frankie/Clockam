export function notFound(_req, res) {
  res.status(404).json({ message: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).find((k) => k !== 'organization');
    const name = { email: 'email address', staffId: 'staff ID', code: 'code' }[field] || 'value';
    return res.status(409).json({ message: `That ${name} is already used by someone else.` });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong' : err.message,
    details: err.details,
  });
}
