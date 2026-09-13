export function readCookie(header: string | undefined, name: string) {
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  const match = parts.find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function tokenCookie(token: string) {
  return `wellrun_token=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`;
}

export function clearTokenCookie() {
  return "wellrun_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}
