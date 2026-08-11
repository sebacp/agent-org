/** What the form offers. `custom` is the escape hatch: crontab, typed by hand. */
export type Cadence = "hourly" | "daily" | "weekdays" | "weekly" | "custom";

const DAYS = [
  "domingos",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábados",
];

const HOURLY = "0 * * * *";
const DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const WEEKDAYS = /^(\d{1,2}) (\d{1,2}) \* \* 1-5$/;
const WEEKLY = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(hour: string, minute: string): string {
  return `${pad(Number(hour))}:${pad(Number(minute))}`;
}

export function cronFor(
  cadence: Cadence,
  /** `HH:MM`, straight from an `<input type="time">`. */
  time: string,
  weekday: number,
): string {
  const [hour = "9", minute = "0"] = time.split(":");
  const h = Number(hour);
  const m = Number(minute);
  switch (cadence) {
    case "hourly":
      return HOURLY;
    case "daily":
      return `${m} ${h} * * *`;
    case "weekdays":
      return `${m} ${h} * * 1-5`;
    default:
      return `${m} ${h} * * ${weekday}`;
  }
}

/** The form reopens on whichever preset wrote the expression, if any did. */
export function readCron(cron: string): {
  cadence: Cadence;
  time: string;
  weekday: number;
} {
  if (cron === HOURLY) return { cadence: "hourly", time: "09:00", weekday: 1 };

  const weekdays = WEEKDAYS.exec(cron);
  if (weekdays) {
    return {
      cadence: "weekdays",
      time: clock(weekdays[2], weekdays[1]),
      weekday: 1,
    };
  }

  const daily = DAILY.exec(cron);
  if (daily) {
    return { cadence: "daily", time: clock(daily[2], daily[1]), weekday: 1 };
  }

  const weekly = WEEKLY.exec(cron);
  if (weekly) {
    return {
      cadence: "weekly",
      time: clock(weekly[2], weekly[1]),
      weekday: Number(weekly[3]),
    };
  }

  return { cadence: "custom", time: "09:00", weekday: 1 };
}

export function describeCron(cron: string): string {
  if (cron === HOURLY) return "Cada hora";

  const weekdays = WEEKDAYS.exec(cron);
  if (weekdays) return `Días hábiles a las ${clock(weekdays[2], weekdays[1])}`;

  const daily = DAILY.exec(cron);
  if (daily) return `Todos los días a las ${clock(daily[2], daily[1])}`;

  const weekly = WEEKLY.exec(cron);
  if (weekly) {
    return `Todos los ${DAYS[Number(weekly[3])]} a las ${clock(weekly[2], weekly[1])}`;
  }

  return cron;
}
