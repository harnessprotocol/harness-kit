// packages/agent-server/src/tools/fs-tools.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BLOCKED_PATTERNS = [
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+~/,
    /dd\s+if=\/dev\/zero/,
    /dd\s+if=\/dev\/null/,
    /:\(\)\s*\{.*:\|:&/,
    /mkfs/,
    /fdisk/,
    />\s*\/dev\/sda/,
    /\|\s*bash/,
    /\|\s*sh\b/,
    /chmod\s+-R\s+777\s+\//,
    /chown\s+-R/,
];
export function validateBashCommand(cmd) {
    const normalized = cmd.toLowerCase();
    return !BLOCKED_PATTERNS.some(p => p.test(normalized));
}
export function buildFsTools(workDir, allowedTools) {
    const allowed = (name) => !allowedTools || allowedTools.includes(name);
    const tools = [];
    if (allowed('read_file')) {
        tools.push(tool(({ path }) => {
            try {
                return readFileSync(path.startsWith('/') ? path : `${workDir}/${path}`, 'utf8');
            }
            catch (e) {
                return `Error reading file: ${e}`;
            }
        }, { name: 'read_file', description: 'Read a file', schema: z.object({ path: z.string() }) }));
    }
    if (allowed('write_file')) {
        tools.push(tool(({ path, content }) => {
            try {
                const abs = path.startsWith('/') ? path : `${workDir}/${path}`;
                writeFileSync(abs, content, 'utf8');
                return `File ${path} written successfully.`;
            }
            catch (e) {
                return `Error writing file: ${e}`;
            }
        }, { name: 'write_file', description: 'Write content to a file',
            schema: z.object({ path: z.string(), content: z.string() }) }));
    }
    if (allowed('edit_file')) {
        tools.push(tool(({ path, old_str, new_str }) => {
            try {
                const abs = path.startsWith('/') ? path : `${workDir}/${path}`;
                const content = readFileSync(abs, 'utf8');
                if (!content.includes(old_str))
                    return `Error: old_str not found in ${path}`;
                writeFileSync(abs, content.replace(old_str, new_str), 'utf8');
                return `File ${path} updated successfully.`;
            }
            catch (e) {
                return `Error editing file: ${e}`;
            }
        }, { name: 'edit_file', description: 'Edit a file by replacing a string',
            schema: z.object({ path: z.string(), old_str: z.string(), new_str: z.string() }) }));
    }
    if (allowed('list_directory')) {
        tools.push(tool(({ path }) => {
            try {
                const abs = path.startsWith('/') ? path : `${workDir}/${path}`;
                return readdirSync(abs).join('\n');
            }
            catch (e) {
                return `Error listing directory: ${e}`;
            }
        }, { name: 'list_directory', description: 'List directory contents',
            schema: z.object({ path: z.string() }) }));
    }
    if (allowed('bash')) {
        tools.push(tool(({ command }) => {
            if (!validateBashCommand(command))
                return `Error: command blocked by security policy.`;
            try {
                return execSync(command, { cwd: workDir, timeout: 30000, encoding: 'utf8' });
            }
            catch (e) {
                return `Exit ${e.status ?? 1}:\n${e.message}`;
            }
        }, { name: 'bash', description: 'Run a shell command',
            schema: z.object({ command: z.string() }) }));
    }
    return tools;
}
