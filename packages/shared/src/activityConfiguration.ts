import type { ActivityScheduleBlock } from './contracts/activities.js';

export const isActivityPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 999999999999;

export const isActivitySchedule = (value: unknown): value is ActivityScheduleBlock => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).every(key => ['weekday','startTime','endTime'].includes(key))
    && Number.isInteger(row.weekday) && Number(row.weekday) >= 0 && Number(row.weekday) <= 6
    && typeof row.startTime === 'string' && typeof row.endTime === 'string'
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)
    && row.startTime < row.endTime;
};

export const areActivitySchedulesValid = (value: unknown): value is ActivityScheduleBlock[] => {
  if (!Array.isArray(value) || value.length > 100 || !value.every(isActivitySchedule)) return false;
  const ordered = [...value].sort((a,b) => a.weekday-b.weekday || a.startTime.localeCompare(b.startTime));
  return ordered.every((block,index) => index === 0 || block.weekday !== ordered[index-1].weekday || block.startTime >= ordered[index-1].endTime);
};
