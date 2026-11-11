export type ExKind = 'power' | 'main' | 'accessory';

export interface Exercise {
  name: string;
  sets: number;
  reps: string; // "5", "6–8", "15 שנ׳", "8 לרגל"
  rest: string;
  notes?: string;
  kind: ExKind;
  track?: boolean; // log weight × reps for this one
}

export interface Workout {
  code: string; // LA, UA, LB, UB
  name: string;
  title: string;
  goal: string;
  exercises: Exercise[];
}

export interface Phase {
  fromWeek: number;
  toWeek: number;
  name: string;
  notes: string;
}

export interface Plan {
  startDate: string; // YYYY-MM-DD, week 1 starts here
  rotation: string[];
  warmup: string[];
  workouts: Workout[];
  phases: Phase[];
  rules: string[];
}

export type Status = 'going' | 'game' | 'skipped' | 'done';

export interface Checkin {
  id: number;
  day: string;
  status: Status;
  workout_code: string | null;
  skip_reason: string | null;
  rating: number | null;
  energy: number | null;
  notes: string | null;
}

export interface SetLog {
  id: number;
  day: string;
  workout_code: string | null;
  exercise: string;
  set_no: number;
  weight: number | null;
  reps: number | null;
}

export interface Metric {
  id: number;
  day: string;
  kind: MetricKind;
  value: number;
}

export type MetricKind = 'sleep' | 'bodyweight' | 'vertical' | 'broad' | 'squat5';

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  kind: 'chat' | 'ask' | 'review' | 'ask_late';
  created_at: string;
}

export interface Memory {
  id: number;
  fact: string;
  created_at: string;
}

export interface Profile {
  tz: string;
  ask_time: string;
  review_time: string;
  weekly_goal: number;
  push_enabled: boolean;
}
