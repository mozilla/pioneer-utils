interface ComponentsType {
  classes: {
    [id: string]: {
      getService(interface: any): any;
    }
  },

  interfaces: {
    nsIUUIDGenerator: any,
  },

  utils: {
    import(path: string, target?: any): any;
    importGlobalProperties(properties: Array<string>): void;
  },
}

declare var Components: ComponentsType;

interface XPCOMUtils {
  XPCOMUtils: {
    defineLazyModuleGetter(target: object, name: string, path: string): void;
  }
}

interface AddonType {
  isActive: boolean;
  uninstall(): void;
}

interface AddonManager {
  getAddonByID(id: string): AddonType | null;
}

interface Services {
  prefs: {
    getCharPref(key: string, defaultValue?: string): string;
    setCharPref(key: string, value: string): void;
    getBoolPref(key: string, defaultValue?: boolean): boolean;
    setBoolPref(key: string, value: boolean): void;
    getIntPref(key: string, defaultValue?: number): number;
    setIntPref(key: string, value: number): void;
  }
}

interface TelemetryOptionsType {
  addClientId?: boolean;
  addEnvironment?: boolean;
}

interface TelemetryControllerType {
  TelemetryController: {
    submitExternalPing(pingName: string, payload: any, options: TelemetryOptionsType): number;
  },
}

interface UUIDGeneratorType {
  generateUUID(): string;
}

declare class TextEncoder {
  constructor(encoding: "utf-8");
  encode(data: string): ArrayBuffer;
}

declare type LogLevelValue = -1 | 10 | 20 | 30 | 40 | 50 | 60 | 70;

declare interface Log {
  Level: {
    [name: string]: LogLevelValue;
  };

  repository: {
    getLogger(name: string): Logger;
  };

  ConsoleAppender: typeof ConsoleAppender;
  BasicFormatter: typeof BasicFormatter;
}

declare interface Formatter {
}

declare class ConsoleAppender {
  constructor(formatter: Formatter);
}

declare class BasicFormatter {
  constructor();
}

declare interface LogAppender { }

declare type LogParameters = {
  [name: string]: any
};

declare interface Logger {
  addAppender(appender: LogAppender): void;
  log(level: LogLevelValue, message: string, params?: LogParameters): void;
  fatal(message: string, params?: LogParameters): void;
  error(message: string, params?: LogParameters): void;
  warn(message: string, params?: LogParameters): void;
  info(message: string, params?: LogParameters): void;
  config(message: string, params?: LogParameters): void;
  debug(message: string, params?: LogParameters): void;
  trace(message: string, params?: LogParameters): void;
}

declare interface nsIFile { }

declare interface nsIURI { }

declare interface BootstrapData {
  /** The ID of the add-on being bootstrapped. */
  id: string;

  /** The version of the add-on being bootstrapped. */
  version: string;

  /**
   * The installation location of the add-on being bootstrapped. This
   * may be a directory or an XPI file depending on whether the add-on
   * is installed unpacked or not.
   */
  installPath: nsIFile;

  /**
   * A URI pointing at the root of the add-ons files, this may be a
   * jar: or file: URI depending on whether the add-on is installed
   * unpacked or not.
   */
  resourceURI: nsIURI;

  /**
   * The previously installed version, if the reason is ADDON_UPGRADE
   * or ADDON_DOWNGRADE, and the method is install or startup.
   */
  oldVersion?: string;

  /**
   * The version to be installed, if the reason is ADDON_UPGRADE or
   * ADDON_DOWNGRADE, and the method is shutdown or uninstall.
   */
  newVersion?: string;
}
