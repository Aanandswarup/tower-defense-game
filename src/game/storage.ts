export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  wave: number;
  kills: number;
  date: number;
}

const KEY = "neon-siege-scores-v1";
const NAME_KEY = "neon-siege-name";
const MUTE_KEY = "neon-siege-muted";

function safeParse(raw: string | null): ScoreEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e) => e && typeof e.score === "number" && typeof e.name === "string"
    );
  } catch {
    return [];
  }
}

export function loadScores(): ScoreEntry[] {
  return safeParse(localStorage.getItem(KEY)).sort((a, b) => b.score - a.score).slice(0, 10);
}

function save(list: ScoreEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const list = loadScores();
  if (list.length < 10) return true;
  return score > list[list.length - 1].score;
}

export function addScore(
  name: string,
  score: number,
  wave: number,
  kills: number
): { list: ScoreEntry[]; id: string; rank: number } {
  const entry: ScoreEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 12) || "ACE",
    score,
    wave,
    kills,
    date: Date.now(),
  };
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 10);
  save(trimmed);
  const rank = trimmed.findIndex((e) => e.id === entry.id);
  return { list: trimmed, id: entry.id, rank };
}

export function updateScoreName(id: string, name: string): ScoreEntry[] {
  const list = loadScores().map((e) =>
    e.id === id ? { ...e, name: name.trim().slice(0, 12) || "ACE" } : e
  );
  save(list);
  return list;
}

export function bestScore(): number {
  const list = loadScores();
  return list.length ? list[0].score : 0;
}

export function getLastName(): string {
  return localStorage.getItem(NAME_KEY) || "ACE";
}
export function setLastName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim().slice(0, 12) || "ACE");
}

export function getMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === "1";
}
export function setMutedPref(m: boolean): void {
  localStorage.setItem(MUTE_KEY, m ? "1" : "0");
}
