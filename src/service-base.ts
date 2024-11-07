import * as acorn from "acorn";
import _ from "lodash";

export type Response = { [key: string]: string | string[] | Response };
type Constructor = typeof ServiceBase & {
  filterPresentRelatedRule(rule: any): any;
  getValidationErrors(
    data: { [key: string]: any[] },
    ruleLists: { [key: string]: any[] },
    names: { [key: string]: string },
    messages: { [key: string]: string },
  ): { [key: string]: string[] };
  getDependencyKeysInRule(rule: any): string[];
  getValidationErrorTemplateMessages(): { [key: string]: string };
  hasArrayObjectRuleInRuleList(ruleList: any[]): boolean;
  removeDependencyKeySymbolInRule(rule: any): any;
};
export default interface ServiceBase {
  constructor: Constructor;
  __proto__: ServiceBase;
}

export default abstract class ServiceBase {
  public readonly BIND_NAME_EXP = /\{\{([a-zA-Z][\w\.\*]+)\}\}/g;
  private static onStartCallbacks: (() => void)[] = [];
  private static onFailCallbacks: (() => void)[] = [];
  private static onSuccessCallbacks: (() => void)[] = [];
  private childs: { [key: string]: ServiceBase };
  private data: { [key: string]: any };
  private errors: { [key: string]: string[] };
  private inputs: { [key: string]: any };
  private isRun: boolean;
  private names: { [key: string]: string };
  private parent: null | ServiceBase;
  private validations: { [key: string]: boolean };

  public abstract getResponseBody(
    result: { [key: string]: string },
    totalErrors: { [key: string]: string[] },
  ): Response;

  public constructor(
    inputs: { [key: string]: any } = {},
    names: { [key: string]: string } = {},
    parent: null | ServiceBase = null,
  ) {
    this.childs = {};
    this.data = {};
    this.errors = {};
    this.inputs = inputs;
    this.names = names;
    this.validations = {};
    this.isRun = false;
    this.parent = parent;

    _.forEach(
      [
        "filterPresentRelatedRule",
        "getValidationErrors",
        "getDependencyKeysInRule",
        "getValidationErrorTemplateMessages",
        "hasArrayObjectRuleInRuleList",
        "removeDependencyKeySymbolInRule",
      ],
      (method) => {
        if (!this.constructor[method]) {
          throw new Error("should be implement method[" + method + "]");
        }
      },
    );

    _.chain(this.inputs)
      .keys()
      .forEach((key) => {
        if (!new RegExp("^[a-zA-Z][w-]{0,}").test(key)) {
          throw new Error(
            key +
              " loader key is not support pattern in " +
              this.constructor.name,
          );
        }
      })
      .value();

    _.chain(this.inputs)
      .keys()
      .forEach((key) => {
        this.validate(key);
      })
      .value();

    ServiceBase.getAllCallbacks();
    ServiceBase.getAllLoaders();
  }

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

    _.forEach([...ServiceBase.getAllTraits(), self], (cls) => {
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
    let arr = {};

    _.chain(self.getCallbacks())
      .keys()
      .forEach((key) => {
        if (!new RegExp("^[a-zA-Z][\\w-]{0,}#[\\w-]{1,}(|@defer)").test(key)) {
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
        if (_.has(arr, key)) {
          throw new Error(
            key +
              " callback key is duplicated in traits in " +
              self.prototype.constructor.name,
          );
        }
        arr[key] = callback;
      });
    });

    return arr;
  }

  public static getAllLoaders() {
    const self = this;
    let arr = {};

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
        if (_.has(arr, key)) {
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

    _.forEach([...ServiceBase.getAllTraits(), self], (cls) => {
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

  public static getAllRuleLists(): Map<Constructor, { [key: string]: any[] }> {
    const self = <Constructor>this;
    let map: Map<Constructor, { [key: string]: any[] }> = new Map();
    _.forEach([...ServiceBase.getAllTraits(), self], (cls) => {
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

  public static getAllTraits(): Constructor[] {
    const self = this;
    let arr: Constructor[] = [];

    _.forEach(self.getTraits(), (cls) => {
      let parent = cls;
      if (!self.isServiceClass(parent)) {
        throw new Error("trait class must extends Service");
      }
      arr = [...arr, ...cls.getAllTraits()];
    });
    arr = [...arr, ...ServiceBase.getTraits()];
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

  public static getTraits(): Constructor[] {
    return [];
  }

  public static initService(value: any[]) {
    _.has(value, 1) ? null : (value[1] = {});
    _.has(value, 2) ? null : (value[2] = {});
    _.has(value, 3) ? null : (value[3] = null);

    const cls = value[0];
    const data = value[1];
    const names = value[2];
    const parent = value[3];

    _.forEach(data, (value, key) => {
      if ("" === value) {
        delete data[key];
      }
    });

    return new cls(data, names, parent);
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

  public getChilds() {
    return _.cloneDeep(this.childs);
  }

  public getData() {
    return _.cloneDeep(this.data);
  }

  public getErrors() {
    return _.cloneDeep(this.errors);
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

  public run() {
    let totalErrors = this.getTotalErrors();

    if (!this.isRun) {
      if (!this.parent) {
        ServiceBase.onStartCallbacks.forEach((callback) => {
          callback();
        });
      }

      _.chain(this.getInputs())
        .keys()
        .forEach((key) => {
          this.validate(key);
        })
        .value();

      [...this.constructor.getAllRuleLists().keys()].forEach((cls) => {
        _.chain(this.constructor.getAllRuleLists().get(cls))
          .keys()
          .forEach((key) => {
            this.validate(key);
          })
          .value();
      });

      _.chain(this.constructor.getAllLoaders())
        .keys()
        .forEach((key) => {
          this.validate(key);
        })
        .value();

      totalErrors = this.getTotalErrors();

      if (!this.parent) {
        if (_.isEmpty(totalErrors)) {
          this.runAllDeferCallbacks();
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

  protected hasArrayObjectRuleInRuleLists(key) {
    let hasArrayObjectRule = false;
    [...this.constructor.getAllRuleLists().keys()].forEach((cl) => {
      const ruleLists = this.constructor.getAllRuleLists().get(cl);
      const ruleList = _.has(ruleLists, key) ? ruleLists[key] : [];

      if (cl.hasArrayObjectRuleInRuleList(ruleList)) {
        hasArrayObjectRule = true;
      }
    });

    return hasArrayObjectRule;
  }

  protected filterAvailableExpandedRuleLists(
    cls: Constructor,
    key,
    data,
    ruleLists,
  ) {
    _.chain(ruleLists)
      .keys()
      .forEach((k) => {
        const segs = k.split(".");
        for (let i = 0; i < segs.length - 1; ++i) {
          const parentKey = segs.slice(0, i + 1).join(".");
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

  protected getClosureDependencies(func: Function) {
    const deps: string[] = [];
    const data = acorn.parse(func.toString(), {
      ecmaVersion: "latest",
    });
    const params = JSON.parse(JSON.stringify(data)).body[0].expression.params;

    _.forEach(params, (param: any) => {
      const dep: string = param.left ? param.left.name : param.name;

      deps.push(_.snakeCase(dep));
    });

    return deps;
  }

  protected getLoadedDataWith(key) {
    let hasServicesInArray, hasError, values, value, loader;
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
      value = this.resolve(loader);
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
    hasError = false;

    _.forEach(values, (v, i) => {
      let service;
      let resolved;
      if (this.constructor.isInitable(v)) {
        _.has(v, 1) ? null : ((<any[]>v)[1] = {});
        _.has(v, 2) ? null : ((<any[]>v)[2] = {});
        _.forEach(v[2], (name, k) => {
          v[2][k] = this.resolveBindName(name);
        });
        v[3] = this;
        service = this.constructor.initService(v);
        resolved = service.run();
      } else if (v instanceof ServiceBase) {
        service = v;
        resolved = service.run();
      }

      if (service) {
        this.childs[hasServicesInArray ? key + "." + i : key] = service;
        if (this.isResolveError(resolved)) {
          delete values[i];
          hasError = true;
          this.validations[key] = false;
        }
        values[i] = resolved;
      }
    });

    if (!hasError) {
      this.data[key] = hasServicesInArray ? values : values[0];
    }

    return this.data;
  }

  protected getOrderedCallbackKeys(key): string[] {
    const promiseKeys = _.filter(
      _.keys(this.constructor.getAllPromiseLists()),
      (value) => {
        return !!value.match(new RegExp("^" + key + "#"));
      },
    );
    const allKeys = _.filter(
      _.keys(this.constructor.getAllCallbacks()),
      (value) => {
        return !!value.match(new RegExp("^" + key + "#"));
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
      let list = this.getShouldOrderedCallbackKeys(deps);
      arr = [...list, key, ...arr];
    });

    return _.uniq(_.values(arr));
  }

  protected isResolveError(value): boolean {
    const errorClass = this.resolveError().constructor;

    return _.isObject(value) && value instanceof errorClass;
  }

  protected resolve(func: Function) {
    const depNames = this.getClosureDependencies(func);
    const depVals: any[] = [];
    const reflected = JSON.parse(
      JSON.stringify(acorn.parse(func.toString(), { ecmaVersion: "latest" })),
    );
    const params = reflected.body[0].expression.params;

    _.forEach(depNames, (depName, i) => {
      // todo: add if case when default value is object
      if (this.validations[depName] && _.has(this.data, depName)) {
        depVals.push(this.data[depName]);
      } else if (this.validations[depName] && params[i].right) {
        depVals.push(params[i].right.value);
      } else {
        return this.resolveError();
      }
    });

    return func.apply(null, depVals);
  }

  protected resolveBindName(name: string): string {
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
      } else if (1 == keySegs.length) {
        name = name.replace("[...]", "");
      }
    }

    return name;
  }

  protected resolveError(): Error {
    return new Error("can't be resolve");
  }

  protected runAllDeferCallbacks() {
    const callbacks = _.pickBy(
      this.constructor.getAllCallbacks(),
      (value, key) => {
        return !!key.match("/:defer$/");
      },
    );

    _.forEach(callbacks, (callback) => {
      this.resolve(callback);
    });

    _.forEach(this.childs, (child) => {
      child.runAllDeferCallbacks();
    });
  }

  protected validate(key, depth = ""): boolean {
    depth = depth ? depth + "|" + key : key;
    const depths = depth.split("|");
    const mainKey = key.split(".")[0];

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

    if (_.has(this.validations, key)) {
      return this.validations[key];
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

    _.forEach(promiseList, (promise) => {
      if (!this.validate(promise, depth)) {
        this.validations[mainKey] = false;
        return false;
      }
    });

    const loader = _.has(this.constructor.getAllLoaders(), mainKey)
      ? this.constructor.getAllLoaders()[mainKey]
      : null;
    const deps = loader ? this.getClosureDependencies(loader) : [];

    _.forEach(deps, (dep) => {
      if (!this.validate(dep, depth)) {
        this.validations[mainKey] = false;
      }
    });

    const data = this.getLoadedDataWith(mainKey);
    const items = JSON.parse(JSON.stringify(data));

    this.validateWith(key, items, depth);

    // unnecessary because data is stored already.
    if (_.has(data, key)) {
      this.data[key] = data[key];
    }

    const orderedCallbackKeys: string[] = this.getOrderedCallbackKeys(key);

    _.forEach(orderedCallbackKeys, (callbackKey: string) => {
      const callback = this.constructor.getAllCallbacks()[callbackKey];
      const deps = this.getClosureDependencies(callback);

      _.forEach(deps, (dep) => {
        if (!this.validate(dep, depth)) {
          this.validations[key] = false;
        }
      });

      if (!callbackKey.match(/@defer$/)) {
        this.resolve(callback);
      }
    });

    if (false === this.validations[key]) {
      return false;
    }

    return true;
  }

  protected validateWith(key, items, depth) {
    const self = this;
    const mainKey = key.split(".")[0];
    _.forEach([...this.constructor.getAllTraits(), self.constructor], (cls) => {
      const names = {};
      let ruleLists = this.getRelatedRuleLists(key, cls);
      ruleLists = this.filterAvailableExpandedRuleLists(
        cls,
        key,
        items,
        ruleLists,
      );

      if (!_.isEmpty(ruleLists)) {
        names[mainKey] = this.resolveBindName("{{" + mainKey + "}}");
      }

      _.forEach(ruleLists, (ruleList, k) => {
        _.forEach(ruleList, (rule, j) => {
          const depKeysInRule = cls.getDependencyKeysInRule(rule);
          _.forEach(depKeysInRule, (depKey) => {
            if (!!depKey.match(/\.\*/)) {
              throw new Error(
                "wildcard(*) key can't exists in rule dependency in " +
                  cls.name,
              );
            }

            if (!this.validate(depKey, depth)) {
              this.validations[key] = false;
              delete ruleLists[k][j];
            }

            names[depKey] = this.resolveBindName("{{" + depKey + "}}");
          });
        });
      });

      _.forEach(ruleLists, (ruleList, k) => {
        _.forEach(ruleList, (rule, j) => {
          ruleLists[k][j] = cls.removeDependencyKeySymbolInRule(rule);
        });
        names[k] = this.resolveBindName("{{" + k + "}}");
      });

      const messages = cls.getValidationErrorTemplateMessages();

      _.forEach(ruleLists, (ruleList, ruleKey) => {
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
          this.errors[ruleKey] = [
            ...this.errors[ruleKey],
            ...errorLists[ruleKey],
          ];
          this.validations[key] = false;
          return false;
        }
      });
    });

    if (_.has(this.validations, key) && false === this.validations[key]) {
      return false;
    }

    this.validations[key] = true;

    return true;
  }
}
