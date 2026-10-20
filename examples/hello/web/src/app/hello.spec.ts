import { describe, expect, it } from 'vitest';
import { backendErrorText, helloLine, roleLabels } from './hello';

describe('helloLine', () => {
  it('greets the user with the organisation', () => {
    expect(helloLine({ display_name: 'Erika Muster', org_name: 'WEG Musterstraße', roles: [] })).toBe(
      'Hello Erika Muster (WEG Musterstraße)'
    );
  });

  it('leaves out a missing organisation and names a missing user', () => {
    expect(helloLine({ display_name: 'Erika Muster', org_name: null, roles: [] })).toBe('Hello Erika Muster');
    expect(helloLine({ display_name: '  ', org_name: 'WEG', roles: [] })).toBe('Hello unbekannt (WEG)');
  });

  it('says just hello before the answer of heimvio is there', () => {
    expect(helloLine(null)).toBe('Hello');
  });
});

describe('roleLabels', () => {
  it('translates known roles in a fixed order and keeps unknown ones', () => {
    expect(roleLabels(['owner', 'beirat', 'custom', 'property_manager'])).toBe('Verwaltung, Beirat, Eigentümer, custom');
  });

  it('drops duplicates and handles no roles', () => {
    expect(roleLabels(['tenant', 'tenant'])).toBe('Mieter');
    expect(roleLabels([])).toBe('keine');
    expect(roleLabels(undefined)).toBe('keine');
  });
});

describe('backendErrorText', () => {
  it('distinguishes the answers of the Node SDK', () => {
    expect(backendErrorText(401, { error: 'unauthorized' })).toMatch(/Nicht angemeldet/);
    expect(backendErrorText(403, { error: 'not_installed', slug: 'hello' })).toMatch(/nicht mehr freigeschaltet/);
    expect(backendErrorText(502, { error: 'gate_unavailable' })).toMatch(/nicht erreichbar/);
    expect(backendErrorText(500, 'boom')).toBe('Das Backend hat mit Status 500 geantwortet.');
  });
});
