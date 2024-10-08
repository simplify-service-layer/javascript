import { Schema } from "joi";
import _ from "lodash";
import ServiceBase, { Response } from "./service-base";
import Joi from "./validation/validator";

export default class Service extends ServiceBase {
  public filterPresentRelatedRule(rule: Schema) {
    const setOnlyPresence = (schema: any) => {
      schema.type = "any";
      schema["_refs"] = { refs: [] };
      schema["_valids"] = null;
      schema["_invalids"] = null;
      schema["_rules"] = [];
      schema["_singleRules"] = new Map();

      if (
        _.has(schema["_flags"], "presence") &&
        schema["_flags"].presence == "required"
      ) {
        schema["_flags"] = { presence: "required" };
      } else {
        schema["_flags"] = {};
      }
    };

    let copyRule = _.cloneDeep(rule);
    setOnlyPresence(copyRule);
    copyRule.$_terms["whens"] = copyRule.$_terms["whens"].reduce(
      (acc, when) => {
        let hasPresenceRule = false;
        ["then", "otherwise"].forEach((after) => {
          const data = when[after];
          if (!!data) {
            setOnlyPresence(data);
          } else {
            when[after] = null;
          }
        });
        if (hasPresenceRule) {
          acc.push(when);
        }
        return acc;
      },
      [],
    );
    return copyRule;
  }

  public getDependencyKeysInRule(ruleSchema: Schema) {
    const refs: Object[] = [];
    const keys: string[] = [];

    ruleSchema.$_terms.whens.forEach((when: any) => {
      const ref = when.ref;
      if (ref) {
        refs.push(ref);
      }
    });

    ["_valids", "_invalids"].forEach((prop) => {
      if (
        _.has(ruleSchema[prop], "_refs") &&
        !_.isEmpty(ruleSchema[prop]["_refs"])
      ) {
        ruleSchema[prop]["_refs"].forEach((ref) => {
          refs.push(ref);
        });
      }
    });

    if (!_.isEmpty(ruleSchema["_rules"])) {
      ruleSchema["_rules"].forEach((rule) => {
        if (_.has(rule, "args")) {
          _.forEach(rule["args"], (arg) => {
            if (
              arg instanceof Object &&
              _.has(arg, "ancestor") &&
              _.has(arg, "display") &&
              _.has(arg, "key") &&
              _.has(arg, "path") &&
              _.has(arg, "depth") &&
              _.has(arg, "root")
            ) {
              refs.push(arg);
            }
          });
        }
      });
    }

    _.forEach(refs, (ref: any) => {
      if (ref.ancestor != "root") {
        throw new Error("ref must starts with /");
      }

      keys.push(ref.key);
    });

    return keys;
  }

  public getValidationErrorTemplateMessages(): { [key: string]: string } {
    const locale = "en";
    let data: { [key: string]: string } = {};
    let status: string | null = null;
    const promise = import("./validation/lang/" + locale + ".json");

    promise.catch((reason) => {
      status = "rejected";
    });

    promise.then((result: { default: { [key: string]: string } }) => {
      status = "fulfilled";
      data = result.default;
    });

    while (_.isEmpty(status)) {}

    return data;
  }

  public getValidationErrors(data, ruleLists, names, messages) {
    const schema = Joi.object({});

    _.forEach(ruleLists, (ruleList, key) => {
      const segs: string[] = key.split(".");
      let pos = schema;
      while (!_.isEmpty(segs)) {
        const seg = <string>segs.shift();
        if (
          !_.has(pos, "_ids") ||
          !_.has(pos["_ids"], "_byKey") ||
          !(<Map<string, any>>pos["_ids"]["_byKey"]).has(seg)
        ) {
          let node;
          if (!_.isEmpty(segs)) {
            node = Joi.object({});
          } else {
            let node = Joi.any();
            _.forEach(ruleList, (rule) => {
              node = node.concat(rule);
            });
          }
          pos = pos.concat(Joi.object({ seg: node })).label(names[key]);
        }
        pos = (<Map<string, any>>pos["_ids"]["_byKey"]).get(seg);
      }
    });

    const errors = {};
    const result = schema.validate(data, {
      abortEarly: false,
      allowUnknown: true,
      messages,
    });

    if (result.error) {
      _.forEach(result.error.details, (detail) => {
        const errorKey = detail.path.join(".");
        if (!_.has(errors, errorKey)) {
          errors[errorKey] = [];
        }
        errors[errorKey].push(detail.message);
      });
    }

    return errors;
  }

  public hasArrayObjectRuleInRuleList(ruleList) {
    if (_.isEmpty(ruleList)) {
      return false;
    }

    _.forEach(ruleList, (rule) => {
      if (rule.type == "object") {
        return true;
      }
    });

    return false;
  }

  public removeDependencyKeySymbolInRule(rule) {
    return rule;
  }

  public getResponseBody(
    result: { [key: string]: string },
    totalErrors: { [key: string]: string[] },
  ): Response {
    if (!!totalErrors) {
      return { errors: _.flatten(Object.values(totalErrors)) };
    }

    return { result };
  }
}
