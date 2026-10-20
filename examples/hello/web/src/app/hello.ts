/**
 * Pure functions of the hello frontend — no Angular imports, unit-tested with
 * vitest (hello.spec.ts).
 */

/** The part of `/heimvio/ext/me` the page shows. */
export interface HelloMe {
  display_name: string | null;
  org_name: string | null;
  roles: string[];
}

const ROLE_LABELS: Record<string, string> = {
  property_manager: 'Verwaltung',
  beirat: 'Beirat',
  owner: 'Eigentümer',
  tenant: 'Mieter',
  meter_reader: 'Ableser',
  iam_org_owner: 'Konto-Inhaber'
};

/** "Hello <user> (<organisation>)" — the operator's wording for the first extension. */
export function helloLine(me: HelloMe | null): string {
  if (!me) return 'Hello';
  const name = me.display_name?.trim() || 'unbekannt';
  const org = me.org_name?.trim();
  return org ? `Hello ${name} (${org})` : `Hello ${name}`;
}

/** Roles in German, in a stable order (known roles first, then unknown ones as they are). */
export function roleLabels(roles: readonly string[] | null | undefined): string {
  if (!roles || roles.length === 0) return 'keine';
  const known = Object.keys(ROLE_LABELS);
  const sorted = [...new Set(roles)].sort((a, b) => rank(a, known) - rank(b, known) || a.localeCompare(b));
  return sorted.map(r => ROLE_LABELS[r] ?? r).join(', ');
}

function rank(role: string, known: string[]): number {
  const i = known.indexOf(role);
  return i === -1 ? known.length : i;
}

/** Text for a failed call of the extension's own backend (`/api/whoami`). */
export function backendErrorText(status: number, body: unknown): string {
  const error = body && typeof body === 'object' ? (body as Record<string, unknown>)['error'] : undefined;
  if (status === 401 || error === 'unauthorized') return 'Nicht angemeldet — bitte die Seite neu laden.';
  if (status === 403 && error === 'not_installed') return 'Die Erweiterung ist für Ihre Organisation nicht mehr freigeschaltet.';
  if (status === 502 || error === 'gate_unavailable') return 'heimvio ist gerade nicht erreichbar.';
  return `Das Backend hat mit Status ${status} geantwortet.`;
}
