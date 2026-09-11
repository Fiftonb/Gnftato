'use strict';

const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function sendResult(res, result, { successStatus = 200, failureStatus = 400 } = {}) {
  return res.status(result.success ? successStatus : failureStatus).json({
    success: result.success,
    data: result.data,
    error: result.error,
    outcomeUnknown: result.outcomeUnknown === true
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = { asyncHandler, sendResult, httpError };
