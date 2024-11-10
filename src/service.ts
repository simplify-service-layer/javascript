import { Schema } from "joi";
import _ from "lodash";
import ServiceBase, { Response } from "./service-base";
import ErrorTemplateMessages from "./validation/lang/en.json";
import Joi from "./validation/validator";

export default class Service extends ServiceBase {
  public static filterPresentRelatedRule(rule: Schema) {
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
    if (copyRule.$_terms && copyRule.$_terms["whens"]) {
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
    }

    return copyRule;
  }

  public static getDependencyKeysInRule(ruleSchema: Schema) {
    const refs: Object[] = [];
    const keys: string[] = [];

    if (ruleSchema.$_terms && ruleSchema.$_terms.whens) {
      ruleSchema.$_terms.whens.forEach((when: any) => {
        const ref = when.ref;
        if (ref) {
          refs.push(ref);
        }
      });
    }

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

  public static getValidationErrorTemplateMessages(): {
    [key: string]: string;
  } {
    return ErrorTemplateMessages;
  }

  public static getValidationErrors(data, ruleLists, names, messages) {
    const errors = {};

    _.forEach(ruleLists, (ruleList, key) => {
      _.forEach(ruleList, (rule) => {
        const segs: string[] = key.split(".");
        const rootSchema = Joi.object({});
        let parentSchema = rootSchema;
        while (!_.isEmpty(segs)) {
          const seg = <string>segs.shift();
          if (
            !_.has(parentSchema, "_ids") ||
            !_.has(parentSchema["_ids"], "_byKey") ||
            !(<Map<string, any>>parentSchema["_ids"]["_byKey"]).has(seg)
          ) {
            let node;
            if (!_.isEmpty(segs)) {
              node = Joi.object({});
            } else {
              node = rule.label(names[key]);
            }

            const schema = parentSchema.concat(Joi.object({ [seg]: node }));
            Object.keys(schema).forEach((k) => {
              parentSchema[k] = schema[k];
            });
          }
          parentSchema = (<Map<string, any>>parentSchema["_ids"]["_byKey"]).get(
            seg,
          ).schema;
        }
        const result = rootSchema.validate(data, {
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
      });
    });

    return errors;
  }

  public static hasArrayObjectRuleInRuleList(ruleList) {
    let hasArrayObject = false;

    if (_.isEmpty(ruleList)) {
      return hasArrayObject;
    }

    _.forEach(ruleList, (rule) => {
      if (rule.type == "object") {
        hasArrayObject = true;
      }
    });

    return hasArrayObject;
  }

  public static removeDependencyKeySymbolInRule(rule) {
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
