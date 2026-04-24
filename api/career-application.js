const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'collegeEmail',
  'officialEmail',
  'phone',
  'resumeLink',
  'college',
];

const ALLOWED_COLLEGES = new Set(['LPU', 'MIT']);

const sanitizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const sanitizePayloadValue = (value) => (typeof value === 'string' ? value.trim() : value);
const sanitizePayload = (payload) =>
  Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, sanitizePayloadValue(value)]));
const buildErrorWithCause = (message, cause) => new Error(message, { cause });
const buildBadRequestError = (message, cause) => {
  const error = buildErrorWithCause(message, cause);
  error.statusCode = 400;
  return error;
};

const parseRequestBody = (body) => {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (parseError) {
      throw buildBadRequestError('Invalid JSON payload', parseError);
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw buildBadRequestError('Invalid request payload');
  }

  return body;
};

const isValidUrl = (value) => {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host);
  } catch {
    return false;
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = parseRequestBody(request.body);
    const normalizedPayload = sanitizePayload(payload);
    const sanitized = {
      firstName: sanitizeString(normalizedPayload.firstName),
      lastName: sanitizeString(normalizedPayload.lastName),
      email: sanitizeString(normalizedPayload.email),
      collegeEmail: sanitizeString(normalizedPayload.collegeEmail),
      officialEmail: sanitizeString(normalizedPayload.officialEmail),
      phone: sanitizeString(normalizedPayload.phone),
      resumeLink: sanitizeString(normalizedPayload.resumeLink),
      college: sanitizeString(normalizedPayload.college),
      collegeValue: sanitizeString(normalizedPayload.collegeValue || normalizedPayload.college),
      jobTitle: sanitizeString(normalizedPayload.jobTitle),
      jobLocation: sanitizeString(normalizedPayload.jobLocation),
      yearsOfExperience: normalizedPayload.yearsOfExperience,
      submittedAt: sanitizeString(normalizedPayload.submittedAt),
    };

    const missingField = REQUIRED_FIELDS.find((field) => !sanitized[field]);
    if (missingField) {
      return response.status(400).json({ error: `Missing required field: ${missingField}` });
    }

    if (!ALLOWED_COLLEGES.has(sanitized.collegeValue)) {
      return response.status(400).json({ error: 'Invalid college selection' });
    }

    if (!isValidUrl(sanitized.resumeLink)) {
      return response.status(400).json({ error: 'Invalid resume link' });
    }

    const submittedAt = sanitized.submittedAt || new Date().toISOString();

    const appsScriptUrl = sanitizeString(process.env.GOOGLE_APPS_SCRIPT_URL);

    if (!appsScriptUrl) {
      throw new Error('Missing GOOGLE_APPS_SCRIPT_URL');
    }

    const scriptResponse = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...sanitized,
        submittedAt,
      }),
    });

    const responseText = await scriptResponse.text();
    let scriptResult;

    try {
      scriptResult = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      console.warn('Unable to parse Apps Script response as JSON:', parseError);
    }

    const scriptSucceeded = scriptResponse.ok && (scriptResult?.success ?? true);

    if (!scriptSucceeded) {
      const message =
        scriptResult?.error ||
        scriptResult?.message ||
        (!scriptResponse.ok ? responseText : '') ||
        'Apps Script request failed';
      throw new Error(message);
    }

    return response.status(200).json({
      success: true,
      message: 'Application received and saved',
      data: {
        ...sanitized,
        submittedAt,
        appsScript: scriptResult,
      },
    });
  } catch (error) {
    console.error('Error processing application:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode =
      typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    return response.status(statusCode).json({
      error: statusCode === 500 ? 'Internal server error' : 'Invalid request',
      message: statusCode === 500 ? 'An unexpected server error occurred.' : message,
    });
  }
}
