/**
 * GlobalChat report triage helpers.
 *
 * Extracted from GlobalChat.jsx so the admin dashboard's Reports tab can use
 * them without importing the chat component (which imports the dashboard).
 */

/** Triage states `database.rules.json` validates on `reports/$id/status`. */
export const REPORT_STATUSES = ['pending', 'resolved', 'dismissed'];

/** Filter options in the Reports tab. `all` is a client-side filter, not a status. */
export const REPORT_FILTERS = ['pending', 'resolved', 'dismissed', 'all'];

export const REPORT_FILTER_LABELS = {
    pending: 'Pending',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
    all: 'All'
};

/**
 * A report written before the status field existed has no `status`; it is still
 * awaiting triage, so it reads as pending.
 * @param {*} report
 * @returns {'pending'|'resolved'|'dismissed'}
 */
export function reportStatus(report) {
    const status = report && typeof report === 'object' ? report.status : null;
    return REPORT_STATUSES.includes(status) ? status : 'pending';
}

/**
 * @param {Array} reports
 * @param {string} filter one of REPORT_FILTERS
 * @returns {Array} newest first
 */
export function filterReports(reports, filter) {
    const list = Array.isArray(reports) ? reports : [];
    const matching = filter === 'all' ? list.slice() : list.filter(r => reportStatus(r) === filter);
    return matching.sort((a, b) => (b?.timestamp || b?.createdAt || 0) - (a?.timestamp || a?.createdAt || 0));
}

/**
 * Condense a raw user-agent into a short "Browser on OS" line so the admin
 * panel shows device context at a glance instead of a wall of text.
 * @param {string} ua
 * @returns {string}
 */
export const summarizeUA = (ua) => {
    if (!ua) return '';
    const os = ['Android', 'iPhone', 'iPad', 'Windows', 'Mac OS X', 'Linux', 'CrOS']
        .find(o => ua.includes(o)) || 'Unknown OS';
    let browser = 'Unknown browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    return `${browser} on ${os}`;
};
