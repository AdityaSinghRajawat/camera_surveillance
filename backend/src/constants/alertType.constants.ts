/** Detection/alert types. Currently only person detection; enum kept open for growth. */
export const ALERT_TYPE = {
  PERSON_DETECTED: 'person_detected',
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

export const ALERT_TYPE_VALUES = Object.values(ALERT_TYPE) as AlertType[];
