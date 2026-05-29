export function createMediaKey(userId: string, sha256: string, fileName: string): string {
  const safeName = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `users/${userId}/${sha256}/${safeName || "upload"}`;
}
