export interface AppEntry {
  id: string;
  type: 'flutter' | 'web';
  repo?: string;
  url?: string;
  prd?: string;
  context?: {
    selectors?: string;
    event_spec?: string;
  };
}

export interface AppsConfig {
  apps: AppEntry[];
}

export type SelectorMap = Record<string, string>;

export interface EventParam {
  [paramName: string]: string; // param name -> expected type ('string' | 'number' | 'boolean')
}

export interface EventSpecEntry {
  trigger: string;
  event_name: string;
  required_params?: EventParam;
  optional_params?: EventParam;
}

export interface EventSpecConfig {
  events: EventSpecEntry[];
}
