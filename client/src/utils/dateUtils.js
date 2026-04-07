const IST_OPTIONS_DATETIME = {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

const IST_OPTIONS_DATE = {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
};

const IST_OPTIONS_TIME = {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

// Timestamps are stored as IST (Asia/Kolkata) in 'YYYY-MM-DD HH:MM:SS' format.
// Append '+05:30' so the browser interprets them as IST, not local time.
const toDate = (str) => {
  if (!str) return null;
  const normalized = str.toString().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const d = new Date(`${normalized}T00:00:00+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }
  // If already has timezone info, use as-is; otherwise treat as IST
  const iso = normalized.endsWith('Z') || normalized.includes('+') ? normalized : normalized + '+05:30';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

export const fmtDateTime = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleString('en-IN', IST_OPTIONS_DATETIME) : '-';
};

export const fmtDate = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleDateString('en-IN', IST_OPTIONS_DATE) : '-';
};

export const fmtTime = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleTimeString('en-IN', IST_OPTIONS_TIME) : '-';
};

// Returns today's date in YYYY-MM-DD format in IST (for date picker defaults)
export const getISTDateString = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const parseDateParts = (dateString) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || '').trim());
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
};

export const getFinancialYearForDate = (dateString = getISTDateString()) => {
  const parts = parseDateParts(dateString);
  if (!parts) {
    return null;
  }

  const startYear = parts.month >= 4 ? parts.year : parts.year - 1;
  return `${startYear}-${startYear + 1}`;
};

export const getFinancialYearLabel = (financialYear) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(financialYear || '').trim());
  if (!match) return '';

  return `FY ${match[1]}-${String(match[2]).slice(-2)}`;
};

export const getFinancialYearRange = (financialYear) => {
  const match = /^(\d{4})-(\d{4})$/.exec(String(financialYear || '').trim());
  if (!match) return null;

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) {
    return null;
  }

  return {
    financialYear,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
    label: getFinancialYearLabel(financialYear)
  };
};

export const getFinancialYearOptions = (count = 6, anchorDate = getISTDateString()) => {
  const currentFinancialYear = getFinancialYearForDate(anchorDate);
  if (!currentFinancialYear) {
    return [];
  }

  const startYear = Number(currentFinancialYear.slice(0, 4));
  return Array.from({ length: count }, (_, index) => {
    const optionStartYear = startYear - index;
    const value = `${optionStartYear}-${optionStartYear + 1}`;
    return {
      value,
      label: getFinancialYearLabel(value)
    };
  });
};
