import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Structural guard only. This does not judge semantic coverage, selection quality,
// maximum grouping, or blind-comparison validity; those need independent review.
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const catalog = JSON.parse(read('AI_DEVELOPMENT/COMPARISON_ELEMENTS.yaml'));
const legacyText = read('AI_DEVELOPMENT/REFERENCE_BENCHMARKS.yaml');
const legacy = JSON.parse(legacyText);
const fixedHash = '33df45517ff254e93113f1cb29eae579362ef9aa9d7f8984a8a691dd6ef209aa';
const sha = text => createHash('sha256').update(text).digest('hex');
assert.equal(sha(read('AI_DEVELOPMENT/FIXED_INSTRUCTIONS.md')), fixedHash);
assert.equal(sha(legacyText), catalog.historicalDiagnostics.sha256);
const oldGroups = legacy.elements.map(e => e.id);
const oldCriteria = legacy.elements.flatMap(e => e.criteria.map(c => c.id));
assert.equal(oldGroups.length, 16);
assert.equal(oldCriteria.length, 62);

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `duplicate ${label}`);
}
function validate(d) {
  const units = d.comparisonElements;
  const ids = units.map(u => u.id);
  unique(ids, 'element');
  unique(d.sources.map(s => s.id), 'source');
  const sourceIds = new Set(d.sources.map(s => s.id));
  const statuses = new Set(['satisfied', 'not satisfied', 'not measured']);
  assert(statuses.has(d.status));
  assert.equal(d.runtime.legacyEvidenceReusableAsCurrent, false);
  for (const [field, backlink] of [['conceptClauses', 'conceptClauses'], ['freshDesignClauses', 'freshDesignClauses']]) {
    unique(d[field].map(c => c.id), field);
    for (const c of d[field]) {
      assert(c.source && c.authority && c.requirement);
      assert(c.comparisonElements.length > 0, `orphan ${c.id}`);
      unique(c.comparisonElements, `mapping ${c.id}`);
      for (const id of c.comparisonElements) {
        const unit = units.find(u => u.id === id);
        assert(unit && unit[backlink].includes(c.id), `missing backlink ${c.id}/${id}`);
      }
    }
    for (const u of units) for (const id of u[backlink]) {
      assert(d[field].some(c => c.id === id && c.comparisonElements.includes(u.id)), `unknown clause ${id}`);
    }
  }
  for (const u of units) {
    assert(u.comparisonBoundary && u.comparisonMethod && u.currentGap);
    assert(statuses.has(u.status), `bad status ${u.id}`);
    assert(d.references[u.reference], `unknown reference ${u.id}`);
    if (u.status !== 'not measured') assert(u.verdictEvidence, `unsupported verdict ${u.id}`);
    const selections = [u.referenceSelection.axes];
    if (u.supplementaryReference) {
      assert(d.references[u.supplementaryReference.id]);
      selections.push(u.supplementaryReference.axes);
    }
    for (const axes of selections) {
      assert.deepEqual(Object.keys(axes).sort(), ['elementQuality', 'fitToConcept', 'longevity', 'reception']);
      for (const a of Object.values(axes)) {
        assert(a.finding && a.assessment && Array.isArray(a.unresolved));
        for (const s of a.sources) assert(sourceIds.has(s), `unknown source ${s}`);
        if (a.unresolved.length) assert.equal(a.assessment, 'substantiation incomplete');
      }
    }
  }
  const mappedGroups = units.flatMap(u => u.legacyElements);
  const mappedCriteria = units.flatMap(u => u.supportingCriteria);
  unique(mappedGroups, 'legacy group mapping');
  unique(mappedCriteria, 'legacy criterion mapping');
  assert.deepEqual(mappedGroups.sort(), [...oldGroups].sort(), 'lost legacy group');
  assert.deepEqual(mappedCriteria.sort(), [...oldCriteria].sort(), 'lost legacy criterion');
  for (const id of d.crossElementEvidence.elements) assert(ids.includes(id));
  assert(d.freshDesignClauses.some(c => c.id === d.crossElementEvidence.design));
  if (units.some(u => u.status !== 'satisfied')) assert.notEqual(d.status, 'satisfied');
}

validate(catalog);
const broken = mutate => {
  const copy = structuredClone(catalog);
  mutate(copy);
  assert.throws(() => validate(copy));
};
broken(d => { d.conceptClauses[0].comparisonElements = []; });
broken(d => { d.comparisonElements[0].supportingCriteria.pop(); });
broken(d => { d.comparisonElements[0].status = 'satisfied'; d.comparisonElements[0].verdictEvidence = null; });
broken(d => { d.comparisonElements[0].referenceSelection.axes.elementQuality.sources.push('unknown'); });
broken(d => { d.runtime.legacyEvidenceReusableAsCurrent = true; });
broken(d => { d.comparisonElements[0].freshDesignClauses.push('missing'); });
console.log(JSON.stringify({ structuralCheck: 'PASS', negativeChecks: 6,
  units: catalog.comparisonElements.length, legacyGroupsPreserved: 16, legacyCriteriaPreserved: 62,
  fixedTextUnchanged: true, formalGameVerdict: catalog.status,
  limitation: 'Not an independent semantic audit or blind comparison.' }));
