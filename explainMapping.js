// explainMapping.js

/**
 * Turn MLS fields array into a friendly description.
 */
function formatMlsFields(mlsFields) {
    if (!Array.isArray(mlsFields) || mlsFields.length === 0) {
      return 'no specific MLS fields';
    }
    if (mlsFields.length === 1) {
      return `the MLS field ${mlsFields[0]}`;
    }
    return `these MLS fields: ${mlsFields.join(', ')}`;
  }
  
  /**
   * Build a plain-English explanation for any mapping type.
   * This is deterministic, no LLM. We can layer LLM on top later.
   *
   * mappingInfo is expected to look like:
   * {
   *   standardName: 'PurchaseContractDate',
   *   mappingType: 'Classes' | 'One To One' | 'Map' | 'Function' | ...,
   *   mlsFields: [...],
   *   mapping: ... (string or object depending on type)
   * }
   */
  
  function buildExplanation(mappingInfo) {
    const {
      standardName,
      mappingType,
      mlsFields,
      mapping,
      classNameLookup = {},
      functionExplanation = null,

    } = mappingInfo;
  
    const fieldLabel = standardName || 'this field';
    const fieldsText = formatMlsFields(mlsFields || []);
  
    if (!mappingType) {
      return `The mapping for ${fieldLabel} is not defined. The result will always be empty.`;
    }
  
    switch (mappingType) {
      case 'One To One': {
        return `For all records, the value for ${fieldLabel} is copied directly from ${fieldsText}. If those MLS fields are empty, the result is also empty.`;
      }
  
      case 'Map': {
        // mapping is often either:
        // 1) { rawValue: normalizedValue, ... }
        // 2) { SomeMlsFieldName: { rawValue: normalizedValue, ... } }
        let mapObj = (mapping && typeof mapping === 'object') ? mapping : null;
  
        if (!mapObj) {
          return `The value for ${fieldLabel} comes from ${fieldsText}, but it is converted through a lookup table.`;
        }
  
        let entries = Object.entries(mapObj);
  
        // Handle the nested shape like { PropertyType: { "Farm": "Farm", ... } }
        if (
          entries.length === 1 &&
          entries[0][1] &&
          typeof entries[0][1] === 'object' &&
          !Array.isArray(entries[0][1])
        ) {
          mapObj = entries[0][1];
          entries = Object.entries(mapObj);
        }
  
        if (entries.length === 0) {
          return `The value for ${fieldLabel} comes from ${fieldsText}, but the lookup table is empty, so the result will usually match the original MLS value.`;
        }
  
        // Build example lines like: "Farm" → "Farm"
        const exampleLines = entries.slice(0, 8).map(([raw, normalized]) => {
          let normalizedStr =
            typeof normalized === 'object' ? JSON.stringify(normalized) : String(normalized);
          return `"${raw}" → "${normalizedStr}"`;
        });
  
        let suffix = '';
        if (entries.length > exampleLines.length) {
          suffix = `\nThere are additional MLS values not listed here that follow the same pattern.`;
        }
  
        return (
          `The value for ${fieldLabel} comes from ${fieldsText}, but specific raw MLS values are converted using a lookup table.\n\n` +
          `The lookup value mappings are: (MLS Lookups → RESO Lookups) \n` +
          exampleLines.join('\n') +
          suffix +
          `\n\nIf the MLS value is not in the table, the result may be empty or stay as the original MLS value, depending on configuration.`
        );
      }
  
      case 'Classes': {
        // mapping is expected to be an object keyed by class code (BUSO, RESI, etc.)
        const classEntries = mapping && typeof mapping === 'object'
          ? Object.entries(mapping)
          : [];
  
        if (classEntries.length === 0) {
          return `The mapping for ${fieldLabel} is based on property classes, but no class-specific rules are defined. The result will be empty.`;
        }
  
        // If we have a functionExplanation, treat this as:
        // "same function used across multiple classes"
        if (functionExplanation) {
          const friendlyNames = classEntries.map(([classCode]) =>
            classNameLookup[classCode] || classCode
          );
          const classList = friendlyNames.join(', ');
  
          // Collect the union of all MLS fields used by the per-class functions
          const allFieldsSet = new Set();
          classEntries.forEach(([, cfg]) => {
            (cfg.mlsFields || []).forEach((f) => allFieldsSet.add(f));
          });
          const allFields = Array.from(allFieldsSet);
          const allFieldsText = allFields.length
            ? `these MLS fields: ${allFields.join(', ')}`
            : 'the available MLS fields for that class';
  
          return (
            `The mapping for ${fieldLabel} uses the same function across multiple property classes: ${classList}.\n\n` +
            `That function reads from ${allFieldsText} to build the result.\n\n` +
            `Function details:\n` +
            functionExplanation
          );
        }
  
        // --- existing non-function Classes behavior below ---
  
        // Check if ALL classes share the same mappingType + mlsFields
        const [firstCode, firstCfg] = classEntries[0];
        const baseType = firstCfg.mappingType || 'Unknown type';
        const baseFields = firstCfg.mlsFields || [];
        const baseFieldsJson = JSON.stringify(baseFields);
  
        const allSameType = classEntries.every(([, cfg]) => (cfg.mappingType || 'Unknown type') === baseType);
        const allSameFields = classEntries.every(([, cfg]) => {
          const f = cfg.mlsFields || [];
          return JSON.stringify(f) === baseFieldsJson;
        });
  
        if (allSameType && allSameFields) {
          // Friendly names for all classes
          const friendlyNames = classEntries.map(([classCode]) =>
            classNameLookup[classCode] || classCode
          );
          const classList = friendlyNames.join(', ');
          const sharedFieldsText = formatMlsFields(baseFields);
  
          let text =
            `The mapping for ${fieldLabel} depends on the property class, but all classes are handled the same way.\n\n` +
            `All classes use a ${baseType} mapping from ${sharedFieldsText}.\n\n` +
            `This applies to these classes: ${classList}.`;
  
          return text;
        }
  
        // Otherwise, list per-class behavior with line breaks
        const classLines = classEntries.slice(0, 8).map(([classCode, cfg]) => {
          const friendlyName = classNameLookup[classCode] || classCode;
          const classFields = formatMlsFields(cfg.mlsFields || []);
          const typeLabel = cfg.mappingType || 'Unknown type';
          // One line per class
          return `${friendlyName} (${classCode}): ${typeLabel} using ${classFields};`;
        });
  
        let suffix = '';
        if (classEntries.length > classLines.length) {
          suffix =
            '\nThere are additional property classes not listed here that follow similar rules.';
        }
  
        return (
          `The mapping for ${fieldLabel} depends on the property class. For each class, it uses its own mapping type and MLS fields.\n\n` +
          `Some examples are:\n` +
          classLines.join('\n') +
          suffix
        );
      }
  
      case 'Function': {
        const hasFunctionBody =
          typeof mapping === 'string' && mapping.trim().length > 0;
  
        // If we have an LLM explanation, prefer that directly
        if (functionExplanation && typeof functionExplanation === 'string') {
          return functionExplanation;
        }
  
        const extra = hasFunctionBody
          ? ' It uses a custom JavaScript function to combine and clean the MLS data.'
          : '';
  
        return `The value for ${fieldLabel} is calculated using ${fieldsText}.${extra} The details of the function can be shown separately if needed.`;
      }
    }
  }
  
  module.exports = {
    buildExplanation,
  };