# Data Lineage Plugin

A Claude Code plugin that traces column-level data lineage through heterogeneous data stacks. Point it at a column and get a full upstream/downstream trace with confidence ratings and a visual diagram.

## What It Does

When you invoke `/data-lineage` with a column name, the skill:

1. Searches for SQL definitions (tables, views, migrations) containing the column
2. Traces view chains recursively to find source tables
3. Searches Java/Scala/Python code for JDBC writes, Spark jobs, and Kafka producers that feed the table
4. Traces upstream sources recursively (up to 5 hops)
5. Finds downstream consumers (up to 3 hops)
6. Rates each hop's confidence (high/medium/low)
7. Generates a structured lineage path and an SVG diagram

## Output

Each trace produces two outputs:

**Structured lineage path** — a text trace showing each hop from source to destination, with file references, transformations, and confidence ratings.

**Visual diagram** — an SVG file (e.g., `lineage-total_amount.svg`) showing the lineage graph. Nodes are color-coded by system type, edges show data flow direction, and the target column is highlighted. Opens in any browser with no dependencies.

## Usage

### Trace a qualified column

```
/data-lineage orders.total_amount
```

### Trace with full qualification

```
/data-lineage reporting.daily_summary.total_amount
```

### Trace with context

```
/data-lineage customer_id in reporting.daily_summary
```

### Trace an unqualified column

```
/data-lineage revenue
```

If the column exists in multiple tables, you'll be asked which one to trace.

## Supported Technologies

The skill searches for lineage across these technologies:

| Technology | What it finds |
|------------|---------------|
| SQL (any dialect) | CREATE TABLE/VIEW, INSERT, SELECT, ALTER, migrations |
| JDBC | PreparedStatement, JdbcTemplate, ResultSet, direct SQL strings |
| Spark | DataFrame reads/writes, Spark SQL, insertInto, saveAsTable |
| Kafka | ProducerRecord, @KafkaListener, consumer subscriptions, topic configs |
| ORM | @Table, @Column, @Entity annotations, entity field mappings |
| dbt | ref(), source(), model SQL files |
| Config | application.yml/properties, topic-to-table mappings |

## Confidence Ratings

Every hop gets a confidence rating:

| Rating | Meaning |
|--------|---------|
| **High** | Direct SQL column reference, explicit column mapping in code |
| **Medium** | Table-level match but column mapping is implicit (`SELECT *`, dynamic fields, generic serialization) |
| **Low** | Inferred from naming convention, proximity in code, or config-only reference |

Overall confidence is the minimum across all hops. "I couldn't find this connection" is a valid and useful result.

## Design Notes

### Why no external dependencies?

The skill uses only codebase search, file reads, and inline SVG generation. No graph libraries, no database connections, no schema introspection tools. This means it works in any codebase without setup — you don't need access to the running database or a specific graphing tool installed.

### Why column-level?

Table-level lineage is easy but not useful enough. Knowing that "Table A feeds Table B" doesn't help when you need to know which column in Table A maps to which column in Table B, and what transformation happens in between. Column-level tracing is harder but answers the question you actually have.

### Why confidence ratings?

In messy stacks, not every hop can be traced with certainty. A `SELECT *` pass-through or a dynamic field mapping might connect two tables, but you can't be sure without running the code. Rather than pretending certainty or giving up entirely, the skill reports what it found and how confident it is. This lets you focus your manual investigation on the uncertain hops.

### Why SVG?

SVG files are self-contained, open in any browser, and require no dependencies. They can be shared, embedded in documentation, or viewed alongside the code. ASCII diagrams are available as a fallback for terminal-only workflows.
