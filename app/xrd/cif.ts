// Minimal CIF 1.1 reader for crystal structures from the Crystallography Open Database.
// Used by the offline reference-structure build script and its tests, not at play time.

import { metricTensor, reciprocalMetric, type CrystalStructure, type SiteAtom, type UnitCell } from './crystallography.ts';
import { isElementSymbol } from './elements.ts';

export type CifLoop = {
  readonly tags: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export type CifBlock = {
  readonly name: string;
  readonly values: ReadonlyMap<string, string>;
  readonly loops: readonly CifLoop[];
};

export type StructureProvenance = {
  readonly codId?: string;
  readonly formula?: string;
  readonly spaceGroup?: string;
  readonly spaceGroupNumber?: number;
  readonly authors: readonly string[];
  readonly title?: string;
  readonly journal?: string;
  readonly year?: number;
  readonly volume?: string;
  readonly firstPage?: string;
  readonly doi?: string;
  readonly temperatureK?: number;
  readonly notes: readonly string[];
};

type Token = { text: string; quoted: boolean };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith(';')) {
      const body = [line.slice(1)];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(';')) {
        body.push(lines[index]);
        index += 1;
      }
      tokens.push({ text: body.join('\n').trim(), quoted: true });
      continue;
    }
    const pattern = /'((?:[^']|'(?!\s|$))*)'(?=\s|$)|"((?:[^"]|"(?!\s|$))*)"(?=\s|$)|(#.*$)|(\S+)/g;
    for (const match of line.matchAll(pattern)) {
      if (match[3] !== undefined) break;
      if (match[1] !== undefined) tokens.push({ text: match[1], quoted: true });
      else if (match[2] !== undefined) tokens.push({ text: match[2], quoted: true });
      else tokens.push({ text: match[4], quoted: false });
    }
  }
  return tokens;
}

function isTag(token: Token) {
  return !token.quoted && token.text.startsWith('_');
}

function isReserved(token: Token) {
  if (token.quoted) return false;
  const text = token.text.toLowerCase();
  return text === 'loop_' || text === 'global_' || text === 'stop_' || text.startsWith('data_') || text.startsWith('save_');
}

export function parseCif(text: string): CifBlock[] {
  const tokens = tokenize(text);
  const blocks: { name: string; values: Map<string, string>; loops: CifLoop[] }[] = [];
  let current: (typeof blocks)[number] | undefined;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    const lower = token.text.toLowerCase();
    if (!token.quoted && lower.startsWith('data_')) {
      current = { name: token.text.slice(5), values: new Map(), loops: [] };
      blocks.push(current);
      index += 1;
      continue;
    }
    if (!current) {
      index += 1;
      continue;
    }
    if (!token.quoted && lower === 'loop_') {
      index += 1;
      const tags: string[] = [];
      while (index < tokens.length && isTag(tokens[index])) {
        tags.push(tokens[index].text.toLowerCase());
        index += 1;
      }
      const values: string[] = [];
      while (index < tokens.length && !isTag(tokens[index]) && !isReserved(tokens[index])) {
        values.push(tokens[index].text);
        index += 1;
      }
      const rows: string[][] = [];
      for (let start = 0; tags.length > 0 && start + tags.length <= values.length; start += tags.length) {
        rows.push(values.slice(start, start + tags.length));
      }
      current.loops.push({ tags, rows });
      continue;
    }
    if (isTag(token)) {
      const value = tokens[index + 1];
      if (value && !isTag(value) && !isReserved(value)) {
        current.values.set(lower, value.text);
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    index += 1;
  }

  return blocks;
}

/** Parses a CIF numeric value, dropping standard uncertainties such as "5.4431(2)". */
export function cifNumber(value: string | undefined) {
  if (value === undefined || value === '?' || value === '.') return undefined;
  const parsed = Number(value.replace(/\(\d+\)$/, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function findLoop(block: CifBlock, tag: string) {
  return block.loops.find((loop) => loop.tags.includes(tag));
}

export function loopColumn(loop: CifLoop, tag: string) {
  const column = loop.tags.indexOf(tag);
  return column < 0 ? undefined : loop.rows.map((row) => row[column]);
}

function firstValue(block: CifBlock, tags: readonly string[]) {
  for (const tag of tags) {
    const value = block.values.get(tag);
    if (value !== undefined && value !== '?' && value !== '.') return value;
  }
  return undefined;
}

function requiredNumber(block: CifBlock, tag: string) {
  const value = cifNumber(block.values.get(tag));
  if (value === undefined) throw new Error(`CIF block ${block.name} is missing ${tag}`);
  return value;
}

function elementFor(typeSymbol: string | undefined, label: string) {
  const source = typeSymbol && typeSymbol !== '?' && typeSymbol !== '.' ? typeSymbol : label;
  const match = source.match(/^([A-Z][a-z]?)/);
  const symbol = match?.[1] === 'D' ? 'H' : match?.[1];
  if (!symbol || !isElementSymbol(symbol)) throw new Error(`Unsupported element in atom site ${label} (${source})`);
  return symbol;
}

// Tensor components in CIF tag order: 11, 22, 33, 12, 13, 23.
const TENSOR_COMPONENTS = [[0, 0], [1, 1], [2, 2], [0, 1], [0, 2], [1, 2]] as const;

/**
 * Equivalent isotropic value of a displacement tensor given as CIF U_ij or B_ij (11, 22, 33, 12, 13, 23):
 * Ueq = ⅓ Σᵢⱼ Uⁱʲ a*ᵢ a*ⱼ (aᵢ · aⱼ) (Fischer & Tillmanns, Acta Cryst. C44 (1988) 775).
 * The mean of the diagonal equals it only in orthogonal cells.
 */
export function equivalentIsotropic(cell: UnitCell, tensor: readonly number[]) {
  const direct = metricTensor(cell);
  const reciprocal = reciprocalMetric(cell);
  let sum = 0;
  TENSOR_COMPONENTS.forEach(([i, j], component) => {
    // Off-diagonal components appear twice in the double sum.
    const weight = i === j ? 1 : 2;
    sum += weight * tensor[component] * Math.sqrt(reciprocal[i][i] * reciprocal[j][j]) * direct[i][j];
  });
  return sum / 3;
}

/** Equivalent isotropic B by site label; off-diagonal columns absent from the loop count as zero. */
export function anisotropicEquivalents(block: CifBlock, cell: UnitCell) {
  const equivalents = new Map<string, number>();
  const loop = findLoop(block, '_atom_site_aniso_label');
  if (!loop) return equivalents;
  const labels = loopColumn(loop, '_atom_site_aniso_label') ?? [];
  const columns = (kind: 'u' | 'b') => ['11', '22', '33', '12', '13', '23'].map((indices) => loopColumn(loop, `_atom_site_aniso_${kind}_${indices}`));
  const uColumns = columns('u');
  const bColumns = columns('b');
  const tensorAt = (tensorColumns: readonly (readonly string[] | undefined)[], row: number) => {
    const values = tensorColumns.map((column, component) => (component >= 3 && column === undefined ? 0 : cifNumber(column?.[row])));
    return values.every((value) => value !== undefined) ? (values as number[]) : undefined;
  };
  labels.forEach((label, row) => {
    const u = tensorAt(uColumns, row);
    const b = tensorAt(bColumns, row);
    if (u) equivalents.set(label, 8 * Math.PI * Math.PI * equivalentIsotropic(cell, u));
    else if (b) equivalents.set(label, equivalentIsotropic(cell, b));
  });
  return equivalents;
}

/** symmetryOperations supplies the space-group operations for files that do not list them. */
export function structureFromCif(
  block: CifBlock,
  options: { readonly symmetryOperations?: readonly string[] } = {},
): { structure: CrystalStructure; provenance: StructureProvenance } {
  const notes: string[] = [];
  const cell: UnitCell = {
    a: requiredNumber(block, '_cell_length_a'),
    b: requiredNumber(block, '_cell_length_b'),
    c: requiredNumber(block, '_cell_length_c'),
    alpha: requiredNumber(block, '_cell_angle_alpha'),
    beta: requiredNumber(block, '_cell_angle_beta'),
    gamma: requiredNumber(block, '_cell_angle_gamma'),
  };

  const symmetryTag = ['_space_group_symop_operation_xyz', '_symmetry_equiv_pos_as_xyz'].find((tag) => findLoop(block, tag));
  const symmetryLoop = symmetryTag ? findLoop(block, symmetryTag) : undefined;
  const symmetryOperations = options.symmetryOperations ?? (symmetryTag && symmetryLoop ? loopColumn(symmetryLoop, symmetryTag) ?? [] : []);
  if (!symmetryOperations.length) throw new Error(`CIF block ${block.name} has no symmetry operations`);

  const atomLoop = findLoop(block, '_atom_site_fract_x');
  if (!atomLoop) throw new Error(`CIF block ${block.name} has no atom sites`);
  const column = (tag: string) => loopColumn(atomLoop, tag);
  const labels = column('_atom_site_label') ?? [];
  const types = column('_atom_site_type_symbol');
  const xs = column('_atom_site_fract_x') ?? [];
  const ys = column('_atom_site_fract_y') ?? [];
  const zs = column('_atom_site_fract_z') ?? [];
  const occupancies = column('_atom_site_occupancy');
  const bIso = column('_atom_site_b_iso_or_equiv');
  const uIso = column('_atom_site_u_iso_or_equiv');
  const anisotropic = anisotropicEquivalents(block, cell);

  const atoms: SiteAtom[] = labels.map((label, row) => {
    const element = elementFor(types?.[row], label);
    const x = cifNumber(xs[row]);
    const y = cifNumber(ys[row]);
    const z = cifNumber(zs[row]);
    if (x === undefined || y === undefined || z === undefined) throw new Error(`Atom site ${label} has incomplete coordinates`);
    const b = cifNumber(bIso?.[row]);
    const u = cifNumber(uIso?.[row]);
    const reported = b ?? (u === undefined ? anisotropic.get(label) : 8 * Math.PI * Math.PI * u);
    // A zero displacement parameter means "not refined": no atom is motionless at room temperature.
    let displacement = reported !== undefined && reported > 0 ? reported : undefined;
    if (displacement === undefined) {
      displacement = element === 'H' ? 1.5 : 0.5;
      const reason = reported === undefined ? 'no displacement parameter in CIF' : 'displacement parameter reported as zero';
      notes.push(`${label}: ${reason}; B = ${displacement} Å² assumed.`);
    }
    return { label, element, x, y, z, occupancy: cifNumber(occupancies?.[row]) ?? 1, bIso: displacement };
  });

  const authorLoop = findLoop(block, '_publ_author_name');
  const temperature = cifNumber(firstValue(block, ['_cell_measurement_temperature', '_diffrn_ambient_temperature']));

  return {
    structure: { cell, symmetryOperations, atoms },
    provenance: {
      codId: firstValue(block, ['_cod_database_code']),
      formula: firstValue(block, ['_chemical_formula_sum']),
      spaceGroup: firstValue(block, ['_space_group_name_h-m_alt', '_symmetry_space_group_name_h-m']),
      spaceGroupNumber: cifNumber(firstValue(block, ['_space_group_it_number', '_symmetry_int_tables_number'])),
      authors: authorLoop ? loopColumn(authorLoop, '_publ_author_name') ?? [] : [],
      title: firstValue(block, ['_publ_section_title']),
      journal: firstValue(block, ['_journal_name_full', '_journal_coden_astm']),
      year: cifNumber(firstValue(block, ['_journal_year'])),
      volume: firstValue(block, ['_journal_volume']),
      firstPage: firstValue(block, ['_journal_page_first']),
      doi: firstValue(block, ['_journal_paper_doi']),
      temperatureK: temperature,
      notes,
    },
  };
}
