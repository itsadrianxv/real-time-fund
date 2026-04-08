const CDN_BASE = 'https://cdn.jsdelivr.net/npm/chinese-days@1/dist/years';
const yearCache = new Map();

export const loadHolidaysForYear = async (year) => {
  if (yearCache.has(year)) {
    return yearCache.get(year);
  }

  try {
    const response = await fetch(`${CDN_BASE}/${year}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const holidays = new Set(Object.keys(payload?.holidays ?? {}));
    yearCache.set(year, holidays);
    return holidays;
  } catch (_error) {
    yearCache.set(year, new Set());
    return yearCache.get(year);
  }
};

export const loadHolidaysForYears = async (years) => {
  await Promise.all([...new Set(years)].map((year) => loadHolidaysForYear(year)));
};

export const isTradingDay = (date, cache = yearCache) => {
  const dayOfWeek = date.day();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  const dateText = date.format('YYYY-MM-DD');
  const year = date.year();
  const holidays = cache.get(year);
  if (!holidays) {
    return true;
  }

  return !holidays.has(dateText);
};
