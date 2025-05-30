import * as acorn from "acorn";
import _ from "lodash";

export type Response = { [key: string]: string | string[] | Response };
export type ServiceBaseClass = typeof ServiceBase & {
  filterPresentRelatedRule(rule: any): any;
  getValidationErrors(
    data: { [key: string]: any[] },
    ruleLists: { [key: string]: any[] },
    names: { [key: string]: string },
    messages: { [key: string]: string },
  ): { [key: string]: string[] };
  getDependencyKeysInRule(rule: any): string[];
  getValidationErrorTemplateMessages(): { [key: string]: string };
  hasArrayObjectRuleInRuleList(ruleList: any[], key?: string): boolean;
};
export default interface ServiceBase {
  constructor: ServiceBaseClass;
  __proto__: ServiceBase;
}

export default abstract class ServiceBase {
  public readonly BIND_NAME_EXP = /\{\{([a-zA-Z][\w\.\*]+)\}\}/g;
  private static onStartCallbacks: (() => void)[] = [];
  private static onFailCallbacks: (() => void)[] = [];
  private static onSuccessCallbacks: (() => void)[] = [];
  private childs: { [key: string]: ServiceBase } = {};
  private data: { [key: string]: any } = {};
  private errors: { [key: string]: string[] } = {};
  private inputs: { [key: string]: any } = {};
  private isRun: boolean = false;
  private names: { [key: string]: string } = {};
  private parent: null | ServiceBase = null;
  private validations: { [key: string]: boolean } = {};

  public abstract getResponseBody(
    result: { [key: string]: string },
    totalErrors: { [key: string]: string[] },
  ): Response;

  public static addOnFailCallback(callback) {
    ServiceBase.onFailCallbacks.push(callback);
  }

  public static addOnStartCallback(callback) {
    ServiceBase.onStartCallbacks.push(callback);
  }

  public static addOnSuccessCallback(callback) {
    ServiceBase.onSuccessCallbacks.push(callback);
  }

  public static getAllBindNames(): { [key: string]: string } {
    const self = this;
    let arr = {};

    _.forEach([...self.getAllTraits(), self], (cls) => {
      const bindNames = cls.getBindNames();
      arr = _.assign(arr, bindNames);
      _.forEach(bindNames, (v, k) => {
        if (k.split(".").length > 1) {
          throw new Error(
            'including "." nested key ' +
              k +
              " cannot be existed in " +
              cls.name,
          );
        }
      });
    });

    return arr;
  }

  public static getAllCallbacks(): { [key: string]: Function } {
    const self = this;
    let arr: { [key: string]: Function } = {};

    _.chain(self.getCallbacks())
      .keys()
      .forEach((key) => {
        if (!new RegExp("^[a-zA-Z][\\w-]{0,}__[\\w-]{1,}(|@defer)").test(key)) {
          throw new Error(
            key +
              " callback key is not support pattern in " +
              self.prototype.constructor.name,
          );
        }
      })
      .value();

    _.forEach(self.getTraits(), (cls) => {
      _.forEach(cls.getAllCallbacks(), (callback, key) => {
        if (_.has(arr, key) && arr[key].toString() !== callback.toString()) {
          throw new Error(
            key +
              " callback key is duplicated in traits in " +
              self.prototype.constructor.name,
          );
        }
        arr[key] = callback;
      });
    });

    arr = Object.assign(arr, self.getCallbacks());

    return arr;
  }

  public static getAllLoaders(): { [key: string]: Function } {
    const self = this;
    let arr: { [key: string]: Function } = {};

    _.chain(self.getLoaders())
      .keys()
      .forEach((key) => {
        if (!new RegExp("^[a-zA-Z][w-]{0,}").test(key)) {
          throw new Error(
            key +
              " loader key is not support pattern in " +
              self.prototype.constructor.name,
          );
        }
      })
      .value();

    _.forEach(this.getTraits(), (cls) => {
      _.forEach(cls.getAllLoaders(), (loader, key) => {
        if (_.has(arr, key) && arr[key].toString() !== loader.toString()) {
          throw new Error(
            key +
              " loader key is duplicated in traits in " +
              self.prototype.constructor.name,
          );
        }
        arr[key] = loader;
      });
    });

    arr = Object.assign(arr, self.getLoaders());

    return arr;
  }

  public static getAllPromiseLists(): { [key: string]: string[] } {
    const self = this;
    let arr = {};

    _.forEach([...self.getAllTraits(), self], (cls) => {
      _.forEach(cls.getPromiseLists(), (promiseList, key) => {
        if (!_.has(arr, key)) {
          arr[key] = [];
        }
        _.forEach(promiseList, (promise) => {
          if (!_.includes(arr[key], promise)) {
            arr[key].push(promise);
          }
        });
      });
    });

    return arr;
  }

  public static getAllRuleLists(): Map<
    ServiceBaseClass,
    { [key: string]: any[] }
  > {
    const self = <ServiceBaseClass>this;
    let map: Map<ServiceBaseClass, { [key: string]: any[] }> = new Map();
    _.forEach([...self.getAllTraits(), self], (cls) => {
      map.set(cls, {});
      const ruleLists = <{ [key: string]: any[] }>map.get(cls);
      _.forEach(cls.getRuleLists(), (ruleList, key) => {
        if (!_.isArray(ruleList)) {
          ruleList = [ruleList];
        }
        if (!_.has(map.get(cls), key)) {
          (<{ [key: string]: any[] }>map.get(cls))[key] = [];
        }
        _.forEach(ruleList, (rule) => {
          (<{ [key: string]: any[] }>map.get(cls))[key].push(rule);
        });
      });
    });

    return map;
  }

  public static getAllTraits(): ServiceBaseClass[] {
    const self = this;
    let arr: ServiceBaseClass[] = [];

    _.forEach(self.getTraits(), (cls) => {
      let parent = cls;
      if (!self.isServiceClass(parent)) {
        throw new Error("trait class must extends Service");
      }
      arr = [...arr, ...cls.getAllTraits()];
    });
    arr = [...arr, ...self.getTraits()];
    arr = _.uniq(arr);

    return arr;
  }

  public static getBindNames(): { [key: string]: string } {
    return {};
  }

  public static getCallbacks(): { [key: string]: Function } {
    return {};
  }

  public static getLoaders(): { [key: string]: Function } {
    return {};
  }

  public static getPromiseLists(): { [key: string]: string[] } {
    return {};
  }

  public static getRuleLists(): { [key: string]: any[] } {
    return {};
  }

  public static getTraits(): ServiceBaseClass[] {
    return [];
  }

  public static initService(value: any[]) {
    _.has(value, 1) ? null : (value[1] = {});
    _.has(value, 2) ? null : (value[2] = {});

    const cls = value[0];
    const data = value[1];
    const names = value[2];

    _.forEach(Object.keys(data), (key) => {
      if ("" === data[key]) {
        delete data[key];
      }
    });

    return new cls().setWith(data, names);
  }

  public static isInitable(value) {
    return (
      _.isArray(value) &&
      _.has(value, 0) &&
      ServiceBase.isServiceClass(value[0])
    );
  }

  public static isServiceClass(parent) {
    let isServiceClass = false;

    while (
      parent.prototype &&
      <Object>parent.prototype.__proto__.constructor !== Object
    ) {
      parent = parent.prototype.__proto__.constructor;
      if (parent == ServiceBase) {
        isServiceClass = true;
      }
    }

    return isServiceClass;
  }

  public clone(): ServiceBase {
    return _.cloneDeep(this);
  }

  public getChilds() {
    return _.cloneDeep(this.childs);
  }

  public getData() {
    return _.cloneDeep(this.data);
  }

  public getErrors() {
    return _.cloneDeep(this.errors);
  }

  public getInjectedPropNames() {
    return _.difference(
      Object.getOwnPropertyNames(this),
      Object.getOwnPropertyNames(
        new (class extends ServiceBase {
          public getResponseBody(
            result: { [key: string]: string },
            totalErrors: { [key: string]: string[] },
          ): Response {
            return {};
          }
        })(),
      ),
    );
  }

  public getInputs() {
    return _.cloneDeep(this.inputs);
  }

  public getNames() {
    return _.cloneDeep(this.names);
  }

  public getTotalErrors() {
    const errors: { [key: string]: any } = this.getErrors();

    _.forEach(this.getChilds(), (child, key) => {
      const childErrors = child.getTotalErrors();
      if (!_.isEmpty(childErrors)) {
        errors[key] = childErrors;
      }
    });

    return errors;
  }

  public getValidations() {
    return _.cloneDeep(this.validations);
  }

  public resolveBindName(name: string): string {
    let boundKeys, bindName;
    while ((boundKeys = this.getBindKeysInName(name))) {
      if (_.isEmpty(boundKeys)) {
        break;
      }

      const key = boundKeys[0];
      const keySegs = key.split(".");
      const mainKey = keySegs[0];
      const bindNames = _.assign(
        this.constructor.getAllBindNames(),
        this.names,
      );

      if (_.has(bindNames, mainKey)) {
        bindName = bindNames[mainKey];
      } else {
        throw new Error(
          '"' + mainKey + '" name not exists in ' + this.constructor.name,
        );
      }

      const pattern = new RegExp("\\{\\{(\\s*)" + key + "(\\s*)\\}\\}");
      const replace = this.resolveBindName(bindName);
      name = name.replace(pattern, replace);
      const matches = [...name.matchAll(/\[\.\.\.\]/g)];

      if (matches.length > 1) {
        throw new Error(
          name + ' has multiple "[...]" string in ' + this.constructor.name,
        );
      }
      if (this.hasArrayObjectRuleInRuleLists(mainKey) && _.isEmpty(matches)) {
        throw new Error(
          '"' +
            mainKey +
            '" name is required "[...]" string in ' +
            this.constructor.name,
        );
      }

      if (keySegs.length > 1) {
        const replace = "[" + _.slice(keySegs, 1).join("][") + "]";
        name = name.replace("[...]", replace);
      }
    }

    return name;
  }

  public async run() {
    if (this.isRun) {
      throw new Error("already run service [" + this.constructor.name + "]");
    }

    this.childs = {};
    this.data = {};
    this.errors = {};
    this.validations = {};

    let totalErrors = this.getTotalErrors();

    if (!this.isRun) {
      if (!this.parent) {
        ServiceBase.onStartCallbacks.forEach((callback) => {
          callback();
        });
      } else {
        _.forEach(Object.keys(this.names), (key) => {
          this.names[key] = this.parent.resolveBindName(this.names[key]);
        });
      }
      for (const key of _.keys(this.getInputs())) {
        await this.validate(key);
      }
      for (const cls of [...this.constructor.getAllRuleLists().keys()]) {
        for (const key of _.keys(this.constructor.getAllRuleLists().get(cls))) {
          await this.validate(key);
        }
      }
      for (const key of _.keys(this.constructor.getAllLoaders())) {
        await this.validate(key);
      }

      totalErrors = this.getTotalErrors();

      if (!this.parent) {
        if (_.isEmpty(totalErrors)) {
          await this.runAllDeferCallbacks();
          _.forEach(this.constructor.onSuccessCallbacks, (callback) => {
            callback();
          });
        } else {
          _.forEach(this.constructor.onFailCallbacks, (callback) => {
            callback();
          });
        }
      }

      this.isRun = true;
    }

    if (_.isEmpty(totalErrors) && !_.has(this.getData(), "result")) {
      throw new Error(
        "result data key is not exists in " + this.constructor.name,
      );
    }

    if (this.parent) {
      if (!_.isEmpty(totalErrors)) {
        return this.resolveError();
      }

      return this.getData()["result"];
    }

    const result = _.has(this.getData(), "result")
      ? this.getData()["result"]
      : null;

    return this.getResponseBody(result, totalErrors);
  }

  public setParent(parent) {
    this.parent = parent;
  }

  public setWith(
    inputs: { [key: string]: any } = {},
    names: { [key: string]: string } = {},
  ) {
    _.forEach(
      [
        "filterPresentRelatedRule",
        "getValidationErrors",
        "getDependencyKeysInRule",
        "getValidationErrorTemplateMessages",
        "hasArrayObjectRuleInRuleList",
      ],
      (method) => {
        if (!this.constructor[method]) {
          throw new Error("should be implement method[" + method + "]");
        }
      },
    );

    if (this.isRun) {
      throw new Error("already run service [" + this.constructor.name + "]");
    }

    const injectedPropNames = this.getInjectedPropNames();

    _.chain(inputs)
      .keys()
      .forEach((key) => {
        if (_.includes(injectedPropNames, key)) {
          throw new Error(
            key +
              " input key is duplicated with property in " +
              this.constructor.name,
          );
        }
        if (!new RegExp("^[a-zA-Z][w-]{0,}").test(key)) {
          throw new Error(
            key +
              " input key is not support pattern in " +
              this.constructor.name,
          );
        }
      })
      .value();

    _.forEach(_.keys(inputs), (key) => {
      if (_.has(this.inputs, key)) {
        throw new Error(
          key + " input key is duplicated in " + this.constructor.name,
        );
      }
    });

    _.forEach(_.keys(names), (key) => {
      if (_.has(this.names, key)) {
        throw new Error(
          key + " name key is duplicated in " + this.constructor.name,
        );
      }
    });

    _.forEach(Object.keys(inputs), (key) => {
      if ("" === inputs[key]) {
        delete inputs[key];
      }
    });

    this.inputs = Object.assign(this.inputs, inputs);
    this.names = Object.assign(this.names, names);

    this.constructor.getAllCallbacks();
    this.constructor.getAllLoaders();

    return this;
  }

  protected hasArrayObjectRuleInRuleLists(key) {
    let hasArrayObjectRule = false;
    [...this.constructor.getAllRuleLists().keys()].forEach((cls) => {
      const ruleLists = this.constructor.getAllRuleLists().get(cls);
      const ruleList = _.has(ruleLists, key) ? ruleLists[key] : [];

      if (cls.hasArrayObjectRuleInRuleList(ruleList, key)) {
        hasArrayObjectRule = true;
      }
    });

    return hasArrayObjectRule;
  }

  protected filterAvailableExpandedRuleLists(
    cls: ServiceBaseClass,
    data,
    ruleLists,
  ) {
    _.chain(ruleLists)
      .keys()
      .forEach((k) => {
        const keySegs = k.split(".");
        for (let i = 0; i < keySegs.length - 1; ++i) {
          const parentKey = keySegs.slice(0, i + 1).join(".");
          const hasArrayObjectRule =
            this.hasArrayObjectRuleInRuleLists(parentKey);

          if (!hasArrayObjectRule) {
            throw new Error(
              parentKey + " key must has array rule in " + cls.name,
            );
          }
        }
      })
      .value();

    let i = 0;

    while (true) {
      ++i;
      const filteredRuleLists = _.pickBy(ruleLists, (v, k) => {
        return new RegExp("\\.\\*$").test(k) || new RegExp("\\.\\*\\.").test(k);
      });

      if (_.isEmpty(filteredRuleLists)) {
        break;
      }

      _.forEach(_.keys(filteredRuleLists), (rKey) => {
        let matches = <RegExpMatchArray>rKey.match("/^(.+?).*/");
        let allSegs = matches ? (matches[1] + ".*").split(".") : [];
        let segs: string[] = [];
        let rKeyVal = data;
        let isLastKeyExists = true;

        while (!_.isEmpty(allSegs)) {
          const seg = <string>allSegs.shift();
          segs.push(seg);
          const k = segs.join(".");

          if (
            !_.isObject(rKeyVal) ||
            (!_.isEmpty(allSegs) && !_.has(rKeyVal, seg))
          ) {
            isLastKeyExists = false;

            break;
          }

          if (!_.isEmpty(allSegs)) {
            rKeyVal = rKeyVal[seg];
          }
        }

        if (isLastKeyExists) {
          _.forEach(rKeyVal, (v, k) => {
            const rNewKey = rKey.replace(
              "/^" + allSegs + ".*/",
              allSegs + "." + k,
            );
            ruleLists[rNewKey] = ruleLists[rKey];
          });
        }
        delete ruleLists[rKey];
      });
    }

    _.forEach(_.keys(ruleLists), (rKey) => {
      let allSegs = rKey.split(".");
      let segs: string[] = [];
      let rKeyVal = data;
      while (!_.isEmpty(allSegs)) {
        const seg = <string>allSegs.shift();
        segs.push(seg);
        const k = segs.join(".");

        if (!_.has(ruleLists, k)) {
          break;
        }

        if (_.isObject(rKeyVal) && !_.has(rKeyVal, seg)) {
          ruleLists[k] = _.filter(ruleLists[k], (rule) => {
            return cls.filterPresentRelatedRule(rule);
          });
        }

        if (
          !_.isObject(rKeyVal) ||
          (!_.isEmpty(allSegs) && !_.has(rKeyVal, seg))
        ) {
          const removeRuleLists = _.chain(ruleLists)
            .keys()
            .filter((v) => {
              return !!v.match("/^" + k + "./");
            })
            .value();
          _.chain(removeRuleLists)
            .keys()
            .forEach((v) => {
              delete ruleLists[v];
            })
            .value();
          break;
        }

        if (!_.isEmpty(allSegs)) {
          rKeyVal = rKeyVal[seg];
        }
      }
    });

    return ruleLists;
  }

  protected getBindKeysInName(str: string) {
    return [...str.matchAll(this.BIND_NAME_EXP)].map((match) => {
      return match[1];
    });
  }

  protected getClosureDependencies(func: Function, excludeProps = true) {
    const deps: string[] = [];
    let data;
    try {
      data = acorn.parse(func.toString(), {
        ecmaVersion: "latest",
      });
    } catch (e) {
      throw new Error("unexpected function code: " + func.toString());
    }
    const params = JSON.parse(JSON.stringify(data)).body[0].expression.params;
    const props = this.getInjectedPropNames();

    _.forEach(params, (param: any) => {
      const dep: string = param.left ? param.left.name : param.name;
      if (excludeProps) {
        if (!props.includes(dep)) {
          deps.push(dep);
        }
      } else {
        deps.push(dep);
      }
    });

    return deps;
  }

  protected async getLoadedDataWith(key) {
    let hasServicesInArray, hasResolveError, values, value, loader;
    const data = this.getData();
    loader = _.has(this.constructor.getAllLoaders(), key)
      ? this.constructor.getAllLoaders()[key]
      : null;

    if (_.has(data, key)) {
      return data;
    }

    if (_.has(this.getInputs(), key)) {
      value = this.getInputs()[key];
    } else {
      if (_.isNull(loader)) {
        return data;
      }
      value = await this.resolve(loader);
    }

    if (this.isResolveError(value)) {
      return data;
    }

    hasServicesInArray = false;
    if (!_.isEmpty(value) && _.isArray(value)) {
      value.forEach((v) => {
        if (this.constructor.isInitable(v)) {
          hasServicesInArray = true;
        }
      });
    }
    values = hasServicesInArray ? value : [value];
    hasResolveError = false;

    for (const [i, v] of Object.entries(values)) {
      let service;
      let resolved;
      if (this.constructor.isInitable(v)) {
        _.has(v, 1) ? null : ((<any[]>v)[1] = {});
        _.has(v, 2) ? null : ((<any[]>v)[2] = {});
        _.forEach(v[2], (name, k) => {
          v[2][k] = this.resolveBindName(name);
        });
        service = this.constructor.initService(<any[]>v);
        service.setParent(this);
        resolved = await service.run();
      } else if (v instanceof ServiceBase) {
        service = v;
        service.setParent(this);
        resolved = await service.run();
      }

      if (service) {
        this.childs[hasServicesInArray ? key + "." + i : key] = service;
        if (this.isResolveError(resolved)) {
          delete values[i];
          hasResolveError = true;
          this.validations[key] = false;
        }
        values[i] = resolved;
      }
    }

    if (!hasResolveError) {
      this.data[key] = hasServicesInArray ? values : values[0];
    }

    return this.data;
  }

  protected getOrderedCallbackKeys(key): string[] {
    const promiseKeys = _.filter(
      _.keys(this.constructor.getAllPromiseLists()),
      (value) => {
        return !!value.match(new RegExp("^" + key + "__"));
      },
    );
    const allKeys = _.filter(
      _.keys(this.constructor.getAllCallbacks()),
      (value) => {
        return !!value.match(new RegExp("^" + key + "__"));
      },
    );
    const orderedKeys = this.getShouldOrderedCallbackKeys(promiseKeys);
    const restKeys = _.difference<string>(allKeys, orderedKeys);

    return [...orderedKeys, ...restKeys];
  }

  protected getRelatedRuleLists(key, cls): { [key: string]: any[] } {
    const ruleLists = this.constructor.getAllRuleLists().has(cls)
      ? this.constructor.getAllRuleLists().get(cls)
      : {};
    const filterLists = _.pickBy(ruleLists, function (ruleList, k) {
      return !!(
        k.match(new RegExp("^" + key + "$")) ||
        k.match(new RegExp("^" + key + "\\."))
      );
    });
    const keySegs = key.split(".");

    _.forEach(_.range(keySegs.length - 1), (i) => {
      const parentKey = keySegs.slice(0, i + 1).join(".");
      if (_.has(ruleLists, parentKey)) {
        filterLists[parentKey] = ruleLists[parentKey];
      }
    });

    return filterLists;
  }

  protected getShouldOrderedCallbackKeys(keys): string[] {
    let arr: string[] = [];

    _.forEach(keys, (key) => {
      const promiseLists = this.constructor.getAllPromiseLists();
      const deps = _.has(promiseLists, key) ? promiseLists[key] : [];
      const orderedKeys = this.getShouldOrderedCallbackKeys(deps);
      arr = [...orderedKeys, key, ...arr];
    });

    return _.uniq(_.values(arr));
  }

  protected isResolveError(value): boolean {
    const errorClass = this.resolveError().constructor;

    return _.isObject(value) && value instanceof errorClass;
  }

  protected async resolve(func: Function) {
    const props = this.getInjectedPropNames();
    const depNames = this.getClosureDependencies(func, false);
    const depVals: any[] = [];
    const reflected = JSON.parse(
      JSON.stringify(acorn.parse(func.toString(), { ecmaVersion: "latest" })),
    );
    const params = {};

    _.forEach(reflected.body[0].expression.params, (param) => {
      params[param.left ? param.left.name : param.name] = param;
    });

    for (const [i, depName] of depNames.entries()) {
      // todo: add if case when default value is object
      if (props.includes(depName)) {
        depVals.push(this[depName]);
      } else if (this.validations[depName] && _.has(this.data, depName)) {
        depVals.push(this.data[depName]);
      } else if (this.validations[depName] && params[depName].right) {
        depVals.push(params[depName].right.value);
      } else {
        return this.resolveError();
      }
    }
    return await func.apply(null, depVals);
  }

  protected resolveError(): Error {
    return new Error("can't be resolve");
  }

  protected async runAllDeferCallbacks() {
    const callbacks = _.pickBy(
      this.constructor.getAllCallbacks(),
      (value, key) => {
        return !!key.match("/:defer$/");
      },
    );

    for (const callback of _.values(callbacks)) {
      await this.resolve(callback);
    }

    for (const child of _.values(this.childs)) {
      await child.runAllDeferCallbacks();
    }
  }

  protected async validate(key, depth = ""): Promise<boolean> {
    depth = depth ? depth + "|" + key : key;
    const depths = depth.split("|");
    const mainKey = key.split(".")[0];

    if (_.has(this.validations, key)) {
      return this.validations[key];
    }

    if (
      _.filter(depths, (seg) => {
        return seg == key;
      }).length >= 2
    ) {
      throw new Error(
        "validation dependency circular reference[" +
          depth +
          "] occurred in " +
          this.constructor.name,
      );
    }

    const keySegs: string[] = key.split(".");
    for (let i = 0; i < keySegs.length - 1; ++i) {
      const parentKey = keySegs.slice(0, i + 1).join(".");
      if (
        _.has(this.validations, parentKey) &&
        true === this.validations[parentKey]
      ) {
        this.validations[key] = true;
        return true;
      }
    }

    const promiseList = _.has(this.constructor.getAllPromiseLists(), mainKey)
      ? this.constructor.getAllPromiseLists()[mainKey]
      : [];

    for (const i in promiseList) {
      const promise = promiseList[i];
      if (!(await this.validate(promise, depth))) {
        this.validations[mainKey] = false;
        return false;
      }
    }

    const loader = _.has(this.constructor.getAllLoaders(), mainKey)
      ? this.constructor.getAllLoaders()[mainKey]
      : null;
    const deps = loader ? this.getClosureDependencies(loader) : [];

    for (const dep of deps) {
      if (!(await this.validate(dep, depth))) {
        this.validations[mainKey] = false;
      }
    }

    const data = await this.getLoadedDataWith(mainKey);
    const items = JSON.parse(JSON.stringify(data));

    await this.validateWith(key, items, depth);

    // unnecessary because data is stored already.
    if (_.has(data, key)) {
      this.data[key] = data[key];
    }

    const orderedCallbackKeys: string[] = this.getOrderedCallbackKeys(key);
    const callbacks = this.constructor.getAllCallbacks();

    for (const callbackKey of orderedCallbackKeys) {
      const callback = this.constructor.getAllCallbacks()[callbackKey];
      const deps = this.getClosureDependencies(callback);

      for (const dep of deps) {
        if (key != dep && !(await this.validate(dep, depth))) {
          this.validations[key] = false;
        }
      }
    }

    if (true === this.validations[key]) {
      for (const callbackKey of orderedCallbackKeys) {
        if (!callbackKey.match(/@defer$/)) {
          const callback = callbacks[callbackKey];
          await this.resolve(callback);
        }
      }
    }

    if (false === this.validations[key]) {
      return false;
    }

    return true;
  }

  protected async validateWith(key, items, depth) {
    const self = this;
    const mainKey = key.split(".")[0];
    for (const cls of [...this.constructor.getAllTraits(), self.constructor]) {
      const names = {};
      let ruleLists = this.getRelatedRuleLists(key, cls);
      ruleLists = this.filterAvailableExpandedRuleLists(cls, items, ruleLists);

      for (const [k, ruleList] of Object.entries(ruleLists)) {
        for (const [j, rule] of Object.entries(ruleList)) {
          const depKeysInRule = cls.getDependencyKeysInRule(rule);
          for (const depKey of depKeysInRule) {
            if (!!depKey.match(/\.\*/)) {
              throw new Error(
                "wildcard(*) key can't exists in rule dependency in " +
                  cls.name,
              );
            }

            const depKeySegs = depKey.split(".");
            let depVal = items;
            let hasDepVal = true;
            while (!_.isEmpty(depKeySegs)) {
              const seg = <string>depKeySegs.shift();
              if (!_.has(depVal, seg)) {
                hasDepVal = false;

                break;
              }
              depVal = depVal[seg];
            }

            if (!hasDepVal) {
              delete ruleLists[k][j];
            }

            if (!(await this.validate(depKey, depth))) {
              this.validations[key] = false;
              delete ruleLists[k][j];
            }

            names[depKey] = this.resolveBindName("{{" + depKey + "}}");
          }
        }
      }

      _.forEach(ruleLists, (ruleList, k) => {
        if (!_.isEmpty(ruleList)) {
          names[k] = this.resolveBindName("{{" + k + "}}");
        }
      });

      const messages = cls.getValidationErrorTemplateMessages();

      for (const [ruleKey, ruleList] of Object.entries(ruleLists)) {
        const errorLists = cls.getValidationErrors(
          items,
          { [ruleKey]: ruleList },
          names,
          messages,
        );

        if (!_.isEmpty(errorLists)) {
          if (!_.has(this.errors, ruleKey)) {
            this.errors[ruleKey] = [];
          }
          errorLists[ruleKey].forEach((error) => {
            if (!this.errors[ruleKey].includes(error)) {
              this.errors[ruleKey].push(error);
            }
          });
          this.validations[key] = false;
          return false;
        }
      }
    }

    if (_.has(this.validations, key) && false === this.validations[key]) {
      return false;
    }

    this.validations[key] = true;

    return true;
  }
}
