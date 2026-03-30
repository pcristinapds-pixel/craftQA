import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadYaml } from '../utils/yaml-loader.js';
import { logger } from '../utils/logger.js';
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
      logger.warn(`apps.yaml not found at ${appsPath}`);
      this.apps = [];
      return;
    }
    const config = await loadYaml<AppsConfig>(appsPath);
    this.apps = config.apps ?? [];
    logger.info(`Loaded ${this.apps.length} app(s) from registry`);
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
      logger.warn(`Selector file not found: ${selectorPath}`);
      return null;
    }
    return loadYaml<SelectorMap>(selectorPath);
  }

  async getEventSpec(appId: string): Promise<EventSpecConfig | null> {
    const app = this.getApp(appId);
    if (!app?.context?.event_spec) return null;

    const specPath = resolve(this.registryDir, app.context.event_spec);
    if (!existsSync(specPath)) {
      logger.warn(`Event spec file not found: ${specPath}`);
      return null;
    }
    return loadYaml<EventSpecConfig>(specPath);
  }
}
