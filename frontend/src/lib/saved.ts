// What a saved forecast looks like when the server sends it, and the plain-words name of each method.
export type SavedForecast = {
  id: number;
  city: string;
  city_name: string;
  source: "live" | "day" | "manual";
  based_on_date: string;
  predicts_for_date: string;
  predicted_pm2_5: number;
  band: string;
  typical_error: number;
  note: string;
  saved_at: string;
};

export const METHOD_LABEL: Record<SavedForecast["source"], string> = {
  live: "Today’s data",
  day: "A recorded day",
  manual: "Values you entered",
};

export const NOTE_MAX = 300;
