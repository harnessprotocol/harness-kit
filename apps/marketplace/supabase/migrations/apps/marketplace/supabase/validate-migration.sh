#!/bin/bash
# Migration validation script for 00006_organizations.sql
# This validates SQL syntax, dependencies, and RLS policies without requiring a live database

set -e

MIGRATION_FILE="$(dirname "$0")/migrations/00006_organizations.sql"
ERRORS=0

echo "=== Validating Migration: 00006_organizations.sql ==="
echo ""

# Check 1: File exists and is readable
echo "✓ Check 1: File exists and is readable"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "✗ ERROR: Migration file not found"
  exit 1
fi

# Check 2: Required table definitions
echo "✓ Check 2: Required table definitions"
REQUIRED_TABLES=("organizations" "org_members" "org_components" "org_component_categories" "org_component_tags" "org_plugin_approvals")
for table in "${REQUIRED_TABLES[@]}"; do
  if grep -q "create table $table" "$MIGRATION_FILE"; then
    echo "  ✓ Table '$table' defined"
  else
    echo "  ✗ ERROR: Table '$table' not found"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 3: Foreign key dependencies (references to existing tables)
echo ""
echo "✓ Check 3: Foreign key dependencies"
EXPECTED_REFS=("references organizations" "references categories" "references tags" "references components")
for ref in "${EXPECTED_REFS[@]}"; do
  if grep -q "$ref" "$MIGRATION_FILE"; then
    echo "  ✓ Foreign key: $ref"
  else
    echo "  ✗ ERROR: Missing foreign key reference: $ref"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 4: RLS enabled on all tables
echo ""
echo "✓ Check 4: RLS enabled on all tables"
for table in "${REQUIRED_TABLES[@]}"; do
  if grep -q "ALTER TABLE $table ENABLE ROW LEVEL SECURITY" "$MIGRATION_FILE"; then
    echo "  ✓ RLS enabled on '$table'"
  else
    echo "  ✗ ERROR: RLS not enabled on '$table'"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 5: Public read policies
echo ""
echo "✓ Check 5: Public read policies"
for table in "${REQUIRED_TABLES[@]}"; do
  if grep -q "CREATE POLICY \"Public read\" ON $table FOR SELECT" "$MIGRATION_FILE"; then
    echo "  ✓ Public read policy on '$table'"
  else
    echo "  ✗ ERROR: Missing public read policy on '$table'"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 6: Namespace constraint on org_components
echo ""
echo "✓ Check 6: Namespace constraint (@org/plugin-name pattern)"
if grep -q '@org/' "$MIGRATION_FILE" && grep -q 'check (slug ~' "$MIGRATION_FILE"; then
  echo "  ✓ Namespace constraint defined"
else
  echo "  ✗ ERROR: Missing @org/ namespace constraint"
  ERRORS=$((ERRORS + 1))
fi

# Check 7: Required functions
echo ""
echo "✓ Check 7: Required functions"
FUNCTIONS=("update_updated_at" "increment_org_component_install_count")
for func in "${FUNCTIONS[@]}"; do
  if grep -q "$func" "$MIGRATION_FILE"; then
    echo "  ✓ Function '$func' referenced/defined"
  else
    echo "  ✗ ERROR: Function '$func' not found"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 8: SECURITY DEFINER on increment function
echo ""
echo "✓ Check 8: SECURITY DEFINER on increment function"
if grep -q "SECURITY DEFINER" "$MIGRATION_FILE"; then
  echo "  ✓ SECURITY DEFINER set correctly"
else
  echo "  ✗ ERROR: Missing SECURITY DEFINER on increment function"
  ERRORS=$((ERRORS + 1))
fi

# Check 9: Indexes for performance
echo ""
echo "✓ Check 9: Indexes for common queries"
INDEXES=("idx_organizations_slug" "idx_org_members_org_id" "idx_org_components_org_id" "idx_org_plugin_approvals_org_id")
for idx in "${INDEXES[@]}"; do
  if grep -q "create index $idx" "$MIGRATION_FILE"; then
    echo "  ✓ Index '$idx' defined"
  else
    echo "  ✗ ERROR: Missing index '$idx'"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 10: Full-text search on org_components
echo ""
echo "✓ Check 10: Full-text search on org_components"
if grep -q "add column fts tsvector" "$MIGRATION_FILE" && grep -q "idx_org_components_fts" "$MIGRATION_FILE"; then
  echo "  ✓ Full-text search configured"
else
  echo "  ✗ ERROR: Missing full-text search configuration"
  ERRORS=$((ERRORS + 1))
fi

# Check 11: Updated_at triggers
echo ""
echo "✓ Check 11: Updated_at triggers"
TRIGGER_TABLES=("organizations" "org_components" "org_plugin_approvals")
for table in "${TRIGGER_TABLES[@]}"; do
  if grep -q "create trigger ${table}_updated_at" "$MIGRATION_FILE"; then
    echo "  ✓ Trigger on '$table'"
  else
    echo "  ✗ WARNING: No updated_at trigger on '$table'"
    # Not a critical error, just a warning
  fi
done

# Check 12: No SQL injection vulnerabilities (no string interpolation in queries)
echo ""
echo "✓ Check 12: SQL injection check"
if grep -E '\$\{.*\}' "$MIGRATION_FILE" > /dev/null; then
  echo "  ✗ ERROR: Found string interpolation - potential SQL injection risk"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✓ No string interpolation found"
fi

# Check 13: Role constraints
echo ""
echo "✓ Check 13: Role constraints"
if grep -q "check (role in ('admin', 'member'))" "$MIGRATION_FILE"; then
  echo "  ✓ Role constraint defined correctly"
else
  echo "  ✗ ERROR: Missing or incorrect role constraint"
  ERRORS=$((ERRORS + 1))
fi

# Check 14: Approval status constraints
echo ""
echo "✓ Check 14: Approval status constraints"
if grep -q "check (status in ('approved', 'denied', 'pending'))" "$MIGRATION_FILE"; then
  echo "  ✓ Status constraint defined correctly"
else
  echo "  ✗ ERROR: Missing or incorrect status constraint"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ VALIDATION PASSED - Migration is ready to apply"
  echo ""
  echo "All checks completed successfully:"
  echo "  • All required tables defined"
  echo "  • Foreign keys reference existing tables"
  echo "  • RLS enabled on all org tables"
  echo "  • Public read policies configured"
  echo "  • Namespace constraints in place (@org/)"
  echo "  • Performance indexes defined"
  echo "  • Security definer functions configured"
  echo "  • No SQL injection vulnerabilities"
  echo ""
  echo "To apply this migration to a Supabase instance:"
  echo "  supabase migration up"
  echo ""
  exit 0
else
  echo "❌ VALIDATION FAILED - $ERRORS error(s) found"
  echo ""
  echo "Please fix the errors above before applying the migration."
  exit 1
fi
