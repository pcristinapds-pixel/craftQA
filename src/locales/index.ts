// This is the single entry point every other file uses to get translated
// text: `import { t } from '../locales/index.js'`. Think of `t` as a big
// object of ready-made sentences, grouped by the part of the app that uses
// them (t.cli.*, t.report.*, t.registry.*, ...). Nobody outside this folder
// needs to know that more than one language exists.
//
// Note for maintainers: the project's own contribution rules (see
// CLAUDE.md) require every string a user actually sees — CLI output, log
// lines, report text — to default to English. That default is deliberate,
// so it is preserved here: sentinel-qa speaks English unless a Portuguese
// (Brazil) locale is explicitly requested, so nothing changes for existing
// users out of the box.
//
// To opt into Portuguese, set the environment variable before running the
// CLI, e.g.:
//   SENTINEL_LOCALE=pt-BR npx sentinel-qa run --app example-web --diff HEAD~1

import { en } from './en.js';
import type { Messages } from './en.js';
import { ptBr } from './pt-br.js';

const dictionaries = {
  en,
  'pt-BR': ptBr,
} as const;

export type Locale = keyof typeof dictionaries;

function resolveLocale(): Locale {
  const raw = process.env.SENTINEL_LOCALE?.trim().toLowerCase();
  return raw === 'pt-br' ? 'pt-BR' : 'en';
}

/**
 * The active message dictionary, picked once at startup based on the
 * SENTINEL_LOCALE environment variable. Defaults to English.
 */
export const t: Messages = dictionaries[resolveLocale()];

export type { Messages };
