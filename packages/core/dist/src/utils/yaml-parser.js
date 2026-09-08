/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import * as yaml from 'yaml';
import { createDebugLogger } from './debugLogger.js';
const debugLogger = createDebugLogger('YAML_PARSER');
/**
 * Parses a YAML string with full spec support (block scalars, nested
 * structures, etc.), falling back to the simple parser on failure so
 * that slightly malformed frontmatter still loads where possible.
 *
 * @param yamlString - YAML string to parse
 * @returns Parsed object
 */
export function parse(yamlString) {
    try {
        const result = yaml.parse(yamlString, {
            schema: 'core',
            // Belt-and-suspenders: filter timestamp/binary from schema tags.
            // The core schema doesn't include them, so this is a no-op in
            // practice — the real defense is in sanitizeValue() which catches
            // Date/Uint8Array from explicit !!tags that bypass schema filtering.
            customTags: (tags) => tags.filter((tag) => {
                const uri = typeof tag === 'string' ? tag : tag.tag;
                return (uri !== 'tag:yaml.org,2002:timestamp' &&
                    uri !== 'tag:yaml.org,2002:binary' &&
                    uri !== 'timestamp' &&
                    uri !== 'binary');
            }),
        });
        if (result && typeof result === 'object' && !Array.isArray(result)) {
            return stripNullValues(result);
        }
        debugLogger.warn(`Full YAML parser returned non-object (${typeof result}), falling back to simple parser`);
    }
    catch (error) {
        debugLogger.warn(`Full YAML parser failed, falling back to simple parser: ${error}`);
    }
    return stripNullValues(parseSimple(yamlString));
}
/**
 * Recursively sanitizes parsed YAML values:
 * - Strips null values so callers can use `!== undefined` consistently
 * - Converts Date / Uint8Array (from explicit !!tags) back to strings
 * - Wraps nested objects in null-prototype containers to prevent
 *   prototype pollution via `__proto__` keys
 */
function sanitizeValue(value) {
    if (value === null) {
        return undefined;
    }
    // Explicit YAML tags (!!timestamp, !!binary) bypass schema filtering
    // and produce Date / Uint8Array objects. Coerce them back to strings
    // so downstream code that expects plain JSON-style values stays safe.
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Uint8Array) {
        return new TextDecoder().decode(value);
    }
    // Recurse into nested plain objects so __proto__ / Date / Uint8Array
    // values inside hooks or metadata are also sanitized.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return stripNullValues(value);
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue).filter((v) => v !== undefined);
    }
    return value;
}
function stripNullValues(obj) {
    // Object.create(null) prevents prototype pollution: a YAML key of
    // "__proto__" becomes a plain own property instead of triggering the
    // __proto__ setter that would replace the object's prototype.
    const cleaned = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
        const sanitized = sanitizeValue(value);
        if (sanitized !== undefined) {
            cleaned[key] = sanitized;
        }
    }
    return cleaned;
}
/**
 * Simple YAML parser for subagent frontmatter.
 * This is a minimal implementation that handles the basic YAML structures
 * needed for subagent configuration files.
 *
 * @param yamlString - YAML string to parse
 * @returns Parsed object
 */
function parseSimple(yamlString) {
    const lines = yamlString
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('#'));
    const result = Object.create(null);
    let currentKey = '';
    let currentArray = [];
    let inArray = false;
    let currentObject = Object.create(null);
    let inObject = false;
    let objectKey = '';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Handle array items
        if (line.startsWith('  - ')) {
            if (!inArray) {
                inArray = true;
                currentArray = [];
            }
            const itemRaw = line.substring(4).trim();
            currentArray.push(parseValue(itemRaw));
            continue;
        }
        // End of array
        if (inArray && !line.startsWith('  - ')) {
            result[currentKey] = currentArray;
            inArray = false;
            currentArray = [];
            currentKey = '';
        }
        // Handle nested object items (simple indentation)
        if (line.startsWith('  ') && inObject) {
            const [key, ...valueParts] = line.trim().split(':');
            const value = valueParts.join(':').trim();
            currentObject[key.trim()] = parseValue(value);
            continue;
        }
        // End of object
        if (inObject && !line.startsWith('  ')) {
            result[objectKey] = currentObject;
            inObject = false;
            currentObject = Object.create(null);
            objectKey = '';
        }
        // Handle key-value pairs
        if (line.includes(':')) {
            const [key, ...valueParts] = line.split(':');
            const value = valueParts.join(':').trim();
            if (value === '') {
                // This might be the start of an object or array
                currentKey = key.trim();
                // Look ahead to determine if this is an array or object
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    if (nextLine.startsWith('  - ')) {
                        // Next line is an array item, so this will be handled in the next iteration
                        continue;
                    }
                    else if (nextLine.startsWith('  ')) {
                        // Next line is indented, so this is an object
                        inObject = true;
                        objectKey = currentKey;
                        currentObject = Object.create(null);
                        currentKey = '';
                        continue;
                    }
                }
            }
            else {
                result[key.trim()] = parseValue(value);
            }
        }
    }
    // Handle remaining array or object
    if (inArray) {
        result[currentKey] = currentArray;
    }
    if (inObject) {
        result[objectKey] = currentObject;
    }
    return result;
}
/**
 * Serializes a record back to YAML using the full eemeli/yaml stringifier so
 * arbitrarily nested values (e.g. CC-style `mcpServers` / `hooks`) round-trip
 * cleanly. The previous hand-rolled formatter only walked one level of
 * nesting and emitted `[object Object]` for anything deeper, corrupting the
 * file on save — see `docs/design/yaml-parser-replacement.md` for the audit.
 *
 * `lineWidth: 0` disables automatic line wrapping so multi-line strings are
 * preserved as-is, matching the stable-output posture the test suite assumes.
 */
export function stringify(obj, options) {
    return yaml.stringify(obj, {
        lineWidth: options?.lineWidth ?? 0,
        minContentWidth: options?.minContentWidth ?? 20,
    });
}
/**
 * Parses a value string into appropriate JavaScript type.
 */
function parseValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null')
        return null;
    if (value === '')
        return '';
    // Handle quoted strings
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        const unquoted = value.slice(1, -1);
        // Unescape quotes and backslashes
        return unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) {
        return num;
    }
    // Return as string
    return value;
}
//# sourceMappingURL=yaml-parser.js.map