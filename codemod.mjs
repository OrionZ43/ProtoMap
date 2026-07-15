#!/usr/bin/env node
/**
 * Кодмод: убирает локальные `const functions = getFunctions();`
 * и переводит все страницы на единый инстанс из $lib/firebase.
 *
 * Запуск:
 *   node codemod.mjs --dry     # показать, что изменится (ничего не пишет)
 *   node codemod.mjs           # применить
 *
 * Что делает:
 *   1. Удаляет строки `const functions = getFunctions();`
 *   2. Выкидывает getFunctions из импортов 'firebase/functions'
 *   3. Дописывает `functions` в существующий импорт из '$lib/firebase',
 *      либо создаёт новый импорт
 *
 * Чего НЕ трогает (специально):
 *   - src/lib/firebase.ts — там источник истины
 *   - `const fns = getFunctions(getApp(), 'us-central1')` в casino/roulette —
 *     другое имя переменной, правится руками
 */

import fs from 'fs';
import path from 'path';

const DRY = process.argv.includes('--dry');
const ROOT = 'src';
const SKIP = ['src/lib/firebase.ts'];

/** Рекурсивный обход .svelte и .ts */
function walk(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
            walk(p, acc);
        } else if (/\.(svelte|ts)$/.test(e.name)) {
            acc.push(p);
        }
    }
    return acc;
}

/** Добавляет `functions` в импорт из $lib/firebase или создаёт импорт */
function ensureImport(src) {
    // Уже импортирован?
    if (/import\s*\{[^}]*\bfunctions\b[^}]*\}\s*from\s*['"]\$lib\/firebase['"]/.test(src)) {
        return src;
    }

    // Есть импорт из $lib/firebase — дописываем в него
    const existing = /import\s*\{([^}]+)\}\s*from\s*(['"])\$lib\/firebase\2/;
    if (existing.test(src)) {
        return src.replace(existing, (_m, names, q) => {
            const list = names.split(',').map(s => s.trim()).filter(Boolean);
            list.push('functions');
            return `import { ${list.join(', ')} } from ${q}$lib/firebase${q}`;
        });
    }

    // Импорта нет — вставляем новой строкой после последнего import
    const lines = src.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s/.test(lines[i])) last = i;
    }
    const indent = last >= 0 ? (lines[last].match(/^\s*/)?.[0] ?? '') : '';
    const stmt = `${indent}import { functions } from '$lib/firebase';`;

    if (last >= 0) {
        lines.splice(last + 1, 0, stmt);
        return lines.join('\n');
    }
    // Нет импортов вообще — после <script>
    const m = src.match(/<script[^>]*>/);
    if (m) {
        const at = m.index + m[0].length;
        return src.slice(0, at) + '\n' + stmt + src.slice(at);
    }
    return stmt + '\n' + src;
}

let touched = 0, removed = 0;
const report = [];

for (const file of walk(ROOT)) {
    if (SKIP.some(s => file.replace(/\\/g, '/').endsWith(s))) continue;

    const orig = fs.readFileSync(file, 'utf8');
    let src = orig;

    // 1. Удаляем объявления `const functions = getFunctions();`
    //    (только без аргументов — с аргументами это осознанный выбор региона)
    const decl = /^[ \t]*const\s+functions\s*=\s*getFunctions\(\s*\)\s*;?[ \t]*\r?\n/gm;
    const hits = (src.match(decl) || []).length;
    if (!hits) continue;

    src = src.replace(decl, '');
    removed += hits;

    // 2. Чистим импорт getFunctions из firebase/functions
    src = src.replace(
        /import\s*\{([^}]+)\}\s*from\s*(['"])firebase\/functions\2\s*;?/g,
        (m, names, q) => {
            const list = names.split(',').map(s => s.trim())
                .filter(n => n && n !== 'getFunctions');
            // Ничего не осталось — выкидываем импорт целиком
            if (!list.length) return '';
            return `import { ${list.join(', ')} } from ${q}firebase/functions${q};`;
        }
    );

    // 3. Гарантируем импорт functions из $lib/firebase
    src = ensureImport(src);

    if (src !== orig) {
        touched++;
        report.push(`  ${file}  (-${hits} getFunctions)`);
        if (!DRY) fs.writeFileSync(file, src, 'utf8');
    }
}

console.log(report.join('\n'));
console.log(`\n${DRY ? '[DRY RUN] ' : ''}файлов: ${touched}, удалено вызовов: ${removed}`);
console.log('\nДальше руками:');
console.log('  • src/routes/casino/roulette/+page.svelte — там `const fns = getFunctions(getApp(), ...)`');
console.log('  • npx svelte-check   — поймает осиротевшие импорты (getApp и т.п.)');
