import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadYaml } from '../utils/yaml-loader.js';
import { logger } from '../utils/logger.js';
import { t } from '../locales/index.js';
import type { AppsConfig, AppEntry, SelectorMap, EventSpecConfig } from './types.js';

export class AppRegistry {
  private apps: AppEntry[] = [];
  private registryDir: string;

  constructor(registryDir: string) {
    this.registryDir = registryDir;
  }

  async load(): Promise<void> {
    const appsPath = resolve(this.registryDir, 'apps.yaml');
    if (!existsSync(appsPath)) {
      logger.warn(t.registry.appsFileNotFound(appsPath));
      this.apps = [];
      return;
    }
    const config = await loadYaml<AppsConfig>(appsPath);
    this.apps = config.apps ?? [];
    logger.info(t.registry.loaded(this.apps.length));
  }

  listApps(): AppEntry[] {
    return this.apps;
  }

  getApp(appId: string): AppEntry | undefined {
    return this.apps.find((a) => a.id === appId);
  }

  async getSelectors(appId: string): Promise<SelectorMap | null> {
    const app = this.getApp(appId);
    if (!app?.context?.selectors) return null;

    const selectorPath = resolve(this.registryDir, app.context.selectors);
    if (!existsSync(selectorPath)) {
      logger.warn(t.registry.selectorFileNotFound(selectorPath));
      return null;
    }
    return loadYaml<SelectorMap>(selectorPath);
  }

  async getEventSpec(appId: string): Promise<EventSpecConfig | null> {
    const app = this.getApp(appId);
    if (!app?.context?.event_spec) return null;

    const specPath = resolve(this.registryDir, app.context.event_spec);
    if (!existsSync(specPath)) {
      logger.warn(t.registry.eventSpecFileNotFound(specPath));
      return null;
    }
    return loadYaml<EventSpecConfig>(specPath);
  }
}
