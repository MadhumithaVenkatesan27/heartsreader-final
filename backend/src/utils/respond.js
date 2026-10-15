/** The frontend expects every response as { status: 'success', message?, accessToken?, data: {...} }. */
function ok(res, data, extra = {}, httpStatus = 200) {
  const body = { status: 'success', ...extra };
  if (data !== undefined) body.data = data;
  return res.status(httpStatus).json(body);
}
module.exports = { ok };
