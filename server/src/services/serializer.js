export function toPublicCase(doc) {
  const item = structuredClone(doc);
  delete item.__v;
  if (item.status !== 'solved') {
    delete item.solution; delete item.result; delete item.accusation;
    item.hints = undefined;
    item.evidence = item.evidence.map(({ purpose, explanation, ...e }) => e);
  }
  return item;
}
