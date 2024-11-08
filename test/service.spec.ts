import Service from "../src/service";
import Joi from "../src/validation/validator";

describe("service", () => {
  test("loadDataFromInput", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for key1",
        };
      }

      public static getLoaders() {
        return {};
      }

      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })(
      {
        result: "result value",
      },
      {},
    );

    service.run();

    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromInputChildBatchService", () => {
    const childService = class extends Service {
      public static getLoaders() {
        return {
          result: () => {
            return "child result value";
          },
        };
      }
    };

    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "parent result name",
        };
      }

      public static getLoaders() {
        return {};
      }

      public static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })(
      {
        result: [[childService], [childService]],
      },
      {},
    );
    service.run();

    expect(service.getData().result).toStrictEqual([
      "child result value",
      "child result value",
    ]);
    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromInputService", () => {
    const childService = class extends Service {
      public static getLoaders() {
        return {
          result: () => {
            return "child result value";
          },
        };
      }
    };

    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "parent result name",
        };
      }

      public static getLoaders() {
        return {};
      }

      public static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })(
      {
        result: [childService],
      },
      {},
    );

    service.run();

    expect(service.getData()["result"]).toBe("child result value");
    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromLoader", () => {
    const service1 = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          result: () => {
            return "result value";
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })({}, {});

    service1.run();

    expect(service1.getErrors()).toEqual({});

    const service2 = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          result: () => {
            return ["aaa", "bbb", "ccc"];
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })({}, {});

    service2.run();

    expect(service2.getErrors()).not.toEqual({});
  });

  test("loadDataKeyInvaildBecauseOfChildrenRule", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "result[...] name",
        };
      }

      public static getLoaders() {
        return {
          result: () => {
            return {
              a: {
                c: "ccc",
              },
              b: {
                c: "ccc",
              },
            };
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.object({})],
          "result.a": [Joi.string()],
          "result.b": [Joi.object({})],
        };
      }
    })({}, {});

    service.run();

    expect(service.getValidations()["result"]).toBe(false);
    expect(service.getValidations()["result.a"]).toBe(false);
    expect(service.getValidations()["result.b"]).toBe(true);
  });

  test("loadDataKeyInvaildBecauseOfParentRule", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "result[...] name",
        };
      }

      public static getLoaders() {
        return {
          result: () => {
            return {
              a: {
                c: "ccc",
              },
              b: {
                c: "ccc",
              },
            };
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.object({})],
          "result.a": [Joi.object(), Joi.valid({ a: "something" })],
          "result.a.c": [Joi.string()],
          "result.b": [Joi.object()],
          "result.b.c": [Joi.string()],
        };
      }
    })({}, {});

    service.run();

    expect(service.getValidations()["result"]).toBe(false);
    expect(service.getValidations()["result.a"]).toBe(false);
    expect(service.getValidations()["result.a.c"]).toBe(false);
    expect(service.getValidations()["result.b"]).toBe(true);
    expect(service.getValidations()["result.b.c"]).toBe(true);
  });

  test("loadName", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {};
      }

      public static getLoaders() {
        return {};
      }

      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })(
      {},
      {
        result: "result name",
      },
    );

    service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("result name");
  });

  test("loadNamebound", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "result name",
        };
      }

      public static getLoaders() {
        return {};
      }

      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })({}, {});

    service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("result name");
  });

  test("loadNameNested", () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {};
      }

      public static getLoaders() {
        return {};
      }

      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })(
      {},
      {
        result: "{{abcd}}",
        aaa: "aaaa",
        abcd: "{{aaa}} bbb ccc ddd",
      },
    );

    service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("aaaa bbb ccc ddd");
  });
});
