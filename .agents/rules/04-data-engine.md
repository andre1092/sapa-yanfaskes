---
trigger: model_decision
description: Apply when working on Google Sheets data ingestion, schema detection, header detection, normalization, type inference, transformation, validation, or data-quality processing.
---

# DATA ENGINE RULES

## PURPOSE

Build a resilient data engine capable of converting heterogeneous
Google Sheets data into a normalized internal representation.

---

## RAW DATA

Google Sheets values may contain:

- strings
- numbers
- booleans
- empty strings
- missing trailing cells
- inconsistent rows
- formulas
- dates represented as formatted strings
- mixed types

Never assume perfect tabular structure.

---

## HEADER DETECTION

The data engine must identify a header row.

Default strategy:

1. inspect the first N rows
2. score rows for header-likelihood
3. detect repeated labels
4. detect mostly text values
5. detect uniqueness
6. select the best candidate

Allow configuration to override automatic detection.

---

## DUPLICATE HEADERS

Example:

Name | Name | Score

must not produce two identical object keys.

Use a deterministic strategy:

Name
Name_2
Score

Record a schema warning.

---

## MISSING CELLS

For:

["A", "B", "C"]
["X", "Y"]

interpret the missing third value safely.

Do not shift columns.

The second row maps:

A → X
B → Y
C → null/empty

---

## TYPE INFERENCE

Infer:

string
number
integer
float
boolean
date
datetime
percentage
currency
null
unknown

Use conservative inference.

Never reinterpret ambiguous strings without evidence.

Example:

"00123"

should not automatically become 123 if preserving identifiers
is important.

---

## DATE HANDLING

Treat spreadsheet dates carefully.

Maintain:
- raw value
- normalized value
- display value

Always respect spreadsheet locale/timezone where applicable.

Never silently change dates because of browser timezone conversion.

---

## NUMERIC PARSING

Support:
1,234
1.234
100%
Rp 10.000
$10.50

only when locale/configuration makes interpretation safe.

Ambiguous numeric values should remain strings.

---

## NORMALIZED RECORD

Use a structure conceptually similar to:

{
  spreadsheetId,
  spreadsheetName,
  worksheetId,
  worksheetName,
  rowIndex,
  data,
  rawRow,
  warnings
}

---

## SCHEMA OBJECT

Each dataset should expose:

{
  fields: [
    {
      key,
      label,
      inferredType,
      nullable,
      sourceColumnIndex
    }
  ]
}

---

## DATA QUALITY

Calculate:

rowCount
columnCount
emptyRowCount
duplicateHeaderCount
missingValueCount
parseWarningCount

Expose data-quality information to the dashboard.

---

## CONSISTENCY

Do not force unrelated spreadsheets into one schema.

Create an adapter/configuration layer.

Potential strategy:

Spreadsheet
→ Dataset Definition
→ Transformation
→ Canonical Model

---

## PERFORMANCE

Do not normalize millions of cells on the main UI thread.

Use pagination, workers, server-side transformation, or incremental
processing when dataset size requires it.

---

## TESTING

Include fixtures for:

- perfect tables
- missing cells
- duplicate headers
- blank rows
- mixed types
- malformed dates
- percentages
- currency
- identifier strings
- empty sheets
- header-only sheets