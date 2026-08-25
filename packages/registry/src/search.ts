import type { IndexSkillEntry, SkillSummary } from '@jvm-expert/core';

/**
 * Search ranking, shared by every registry implementation so results are ordered the same way
 * whatever the backend. Intentionally simple: substring scoring over name, keywords and
 * description, which is the right amount of machinery for an index that fits in memory.
 */
export function matches(skill: IndexSkillEntry, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return true;

  const terms = query.split(/\s+/).filter(Boolean);
  const haystack = `${skill.name} ${skill.keywords.join(' ')} ${skill.description}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function score(skill: IndexSkillEntry, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return 0;

  const name = skill.name.toLowerCase();
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 60;
  if (skill.keywords.some((keyword) => keyword.toLowerCase() === query)) return 50;
  if (skill.keywords.some((keyword) => keyword.toLowerCase().includes(query))) return 30;
  if (skill.description.toLowerCase().includes(query)) return 10;
  return 0;
}

export function toSummaries(
  skills: readonly IndexSkillEntry[],
  registry: string,
  limit?: number,
  query = '',
): readonly SkillSummary[] {
  const ranked = [...skills].sort((a, b) => {
    const difference = score(b, query) - score(a, query);
    return difference !== 0 ? difference : a.name.localeCompare(b.name);
  });

  const summaries = ranked.map((skill): SkillSummary => ({
    name: skill.name,
    description: skill.description,
    keywords: skill.keywords,
    latest: skill.latest,
    registry,
  }));

  return limit === undefined ? summaries : summaries.slice(0, limit);
}
