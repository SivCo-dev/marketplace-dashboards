export function createCanonicalSkuResolver(explicitAliases = []) {
  const aliases = new Map();

  for (const row of explicitAliases) {
    const key = aliasKey(row.marketplace, row.account_id, row.external_sku);
    if (!row.external_sku || !row.canonical_sku) {
      throw new Error("Every SKU alias must define external_sku and canonical_sku");
    }
    if (aliases.has(key)) {
      throw new Error(`Duplicate SKU alias: ${key}`);
    }
    aliases.set(key, String(row.canonical_sku));
  }

  return ({ marketplace = "*", account_id = "*", external_sku }) => {
    const external = String(external_sku ?? "").trim();
    if (!external) return "";

    const keys = [
      aliasKey(marketplace, account_id, external),
      aliasKey(marketplace, "*", external),
      aliasKey("*", "*", external),
    ];
    for (const key of keys) {
      if (aliases.has(key)) return aliases.get(key);
    }

    // Contract DEV 2.2: no implicit normalization or heuristic matching.
    return external;
  };
}

function aliasKey(marketplace, accountId, externalSku) {
  return [marketplace || "*", accountId || "*", externalSku]
    .map((value) => String(value).trim().toUpperCase())
    .join("|");
}
