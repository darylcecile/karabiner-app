import type { Slugmoji } from "@karabiner/shared";

export const slugmojis: Slugmoji[] = [
  { slug: "smiley", emoji: "😀", createdBy: "system" },
  { slug: "smile", emoji: "🙂", createdBy: "system" },
  { slug: "shipit", emoji: "🚢", createdBy: "system" },
  { slug: "openclaw", emoji: "🦀", createdBy: "system" },
  { slug: "spark", emoji: "✨", createdBy: "system" },
  { slug: "thumbsup", emoji: "👍", createdBy: "system" },
  { slug: "tada", emoji: "🎉", createdBy: "system" }
];

export function expandSlugmojis(input: string, entries: Slugmoji[]): string {
  const knownSlugmojis = new Map(entries.map((entry) => [entry.slug.toLowerCase(), entry.emoji]));

  return input.replace(/:([a-z0-9_-]+):/gi, (token, slug: string) => {
    return knownSlugmojis.get(slug.toLowerCase()) ?? token;
  });
}
