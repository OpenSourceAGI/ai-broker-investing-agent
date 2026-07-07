#!/bin/bash

# Test script to verify version update logic works correctly
# This simulates what the GitHub Actions workflow will do

set -e

echo "[TEST] Testing version update logic..."
echo ""

# Simulate a version
TEST_VERSION="0.5.0"
echo "Test version: $TEST_VERSION"
echo ""

# Create temporary copies of package files
cp core/package.json /tmp/test-core-package.json
cp sdks/typescript/package.json /tmp/test-ts-package.json
cp sdks/python/pyproject.toml /tmp/test-pyproject.toml

echo "[DEBUG] Testing sed commands..."
echo ""

# Test core package.json update
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$TEST_VERSION\"/" /tmp/test-core-package.json
CORE_VERSION=$(grep '"version":' /tmp/test-core-package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "[OK] core/package.json version: $CORE_VERSION"

# Test TypeScript SDK package.json update
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$TEST_VERSION\"/" /tmp/test-ts-package.json
TS_VERSION=$(grep '"version":' /tmp/test-ts-package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "[OK] sdks/typescript/package.json version: $TS_VERSION"

# Test Python pyproject.toml update
sed -i.bak "s/^version = \".*\"/version = \"$TEST_VERSION\"/" /tmp/test-pyproject.toml
PY_VERSION=$(grep '^version = ' /tmp/test-pyproject.toml | sed 's/version = "\(.*\)"/\1/')
echo "[OK] sdks/python/pyproject.toml version: $PY_VERSION"

# Test generator command updates
sed -i.bak "s/packageVersion=[0-9.]\+/packageVersion=$TEST_VERSION/" /tmp/test-core-package.json
GENERATOR_VERSION=$(grep 'packageVersion=' /tmp/test-core-package.json | sed 's/.*packageVersion=\([0-9.]\+\).*/\1/')
echo "[OK] Python generator packageVersion: $GENERATOR_VERSION"

sed -i.bak "s/npmVersion=[0-9.]\+/npmVersion=$TEST_VERSION/" /tmp/test-core-package.json
NPM_VERSION=$(grep 'npmVersion=' /tmp/test-core-package.json | sed 's/.*npmVersion=\([0-9.]\+\).*/\1/')
echo "[OK] TypeScript generator npmVersion: $NPM_VERSION"

echo ""

# Verify all versions match
if [ "$CORE_VERSION" = "$TEST_VERSION" ] && \
   [ "$TS_VERSION" = "$TEST_VERSION" ] && \
   [ "$PY_VERSION" = "$TEST_VERSION" ] && \
   [ "$GENERATOR_VERSION" = "$TEST_VERSION" ] && \
   [ "$NPM_VERSION" = "$TEST_VERSION" ]; then
    echo "[SUCCESS] All version updates successful!"
    echo ""
    echo "The workflow will correctly update versions from git tags."
else
    echo "[ERROR] Version mismatch detected!"
    echo "Expected: $TEST_VERSION"
    echo "Core: $CORE_VERSION"
    echo "TS: $TS_VERSION"
    echo "Python: $PY_VERSION"
    echo "Generator (Python): $GENERATOR_VERSION"
    echo "Generator (TS): $NPM_VERSION"
    exit 1
fi

# Cleanup
rm /tmp/test-*.json /tmp/test-*.toml /tmp/test-*.bak 2>/dev/null || true
