import Service from "../src/service";
import Joi from "../src/validation/validator";

describe("service", () => {
  test("callback", async () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getCallbacks() {
        return {
          result__cb1: (result) => {
            result.abcd = "aaaa";
          },
        };
      }

      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })().setWith(
      {
        result: {
          aaaa: "aaaa",
        },
      },
      {},
    );

    await service.run();

    expect(service.getErrors()).toEqual({});
    expect(service.getData()["result"]).toEqual({
      aaaa: "aaaa",
      abcd: "aaaa",
    });
  });

  test("callbackWithDependency", async () => {
    const service1 = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getCallbacks() {
        return {
          result__cb1: (result, test1) => {
            result.abcd = test1;
          },
          result__cb2: (result, test2) => {
            result.bcde = test2;
          },
        };
      }

      public static getLoaders() {
        return {
          test1: () => {
            return "test1 val";
          },
        };
      }
      static getRuleLists() {
        return {
          result: [Joi.required()],
        };
      }
    })().setWith(
      {
        result: {
          aaaa: "aaaa",
        },
      },
      {},
    );

    await service1.run();

    expect(service1.getErrors()).toEqual({});
    expect(service1.getValidations()).toEqual({
      result: true,
      test1: true,
      test2: true,
    });
    expect(service1.getData()["result"]).toEqual({
      aaaa: "aaaa",
      abcd: "test1 val",
    });

    const service2 = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
          test2: "name for test2",
        };
      }

      public static getCallbacks() {
        return {
          result__cb1: (result, test1) => {
            result.abcd = test1;
          },
          result__cb2: (result, test2) => {
            result.bcde = test2;
          },
        };
      }

      public static getLoaders() {
        return {
          test1: () => {
            return "test1 val";
          },
        };
      }
      static getRuleLists() {
        return {
          result: [Joi.required()],
          test2: [Joi.required()],
        };
      }
    })().setWith(
      {
        result: {
          aaaa: "aaaa",
        },
      },
      {},
    );

    await service2.run();
    expect(service2.getErrors()).not.toEqual({});
    expect(service2.getValidations()).toEqual({
      result: false,
      test1: true,
      test2: false,
    });
    expect(service2.getData()["result"]).toEqual({
      aaaa: "aaaa",
    });
  });

  test("loadDataFromInput", async () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
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
    })().setWith(
      {
        result: "result value",
      },
      {},
    );

    await service.run();

    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromInputChildBatchService", async () => {
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
    })().setWith(
      {
        result: [[childService], [childService]],
      },
      {},
    );
    await service.run();

    expect(service.getData().result).toStrictEqual([
      "child result value",
      "child result value",
    ]);
    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromInputService", async () => {
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
    })().setWith(
      {
        result: [childService],
      },
      {},
    );

    await service.run();

    expect(service.getData()["result"]).toBe("child result value");
    expect(service.getErrors()).toEqual({});
  });

  test("loadDataFromLoader", async () => {
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
    })().setWith({}, {});

    await service1.run();

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
    })().setWith({}, {});

    await service2.run();

    expect(service2.getErrors()).not.toEqual({});
  });

  test("loadDataFromLoaderWithDefaultValue", async () => {
    const service1 = new (class extends Service {
      public static getBindNames() {
        return {};
      }

      public static getLoaders() {
        return {
          result: (key1 = "abcd") => {
            return key1;
          },
        };
      }

      public static getRuleLists() {
        return {};
      }
    })().setWith({}, {});

    await service1.run();

    expect(service1.getErrors()).toEqual({});
    expect(service1.getData()["result"]).toEqual("abcd");
  });

  test("loadDataFromLoaderWithDependency", async () => {
    const service1 = new (class extends Service {
      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          aaa: () => {
            return "aaaaaa";
          },
          result: (aaa) => {
            return aaa + " value";
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })().setWith({}, {});

    await service1.run();

    expect(service1.getErrors()).toEqual({});
    expect(service1.getData()["result"]).toEqual("aaaaaa value");
  });

  test("loadDataFromProperty", async () => {
    const service1 = new (class extends Service {
      key1: string = "aaaa";

      public static getBindNames() {
        return {
          key1: "name for key1",
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          result: (key1) => {
            return key1;
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })().setWith({}, {});

    await service1.run();

    expect(service1.getErrors()).toEqual({});

    const service2 = new (class extends Service {
      key1: string[] = ["aaa", "bbb", "ccc"];

      public static getBindNames() {
        return {
          key1: "name for key1",
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          result: (key1) => {
            return key1;
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })().setWith({}, {});

    await service2.run();

    expect(service2.getErrors()).not.toEqual({});
  });

  test("loadDataFromPropertyInDependency", async () => {
    const service1 = new (class extends Service {
      aaa: string = "aaaaaa";

      public static getBindNames() {
        return {
          result: "name for result",
        };
      }

      public static getLoaders() {
        return {
          result: (aaa) => {
            return aaa + " value";
          },
        };
      }

      public static getRuleLists() {
        return {
          result: [Joi.required(), Joi.string()],
        };
      }
    })().setWith({}, {});

    await service1.run();

    expect(service1.getErrors()).toEqual({});
    expect(service1.getData()["result"]).toEqual("aaaaaa value");
  });

  test("loadDataKeyInvaildBecauseOfChildrenRule", async () => {
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
    })().setWith({}, {});

    await service.run();

    expect(service.getValidations()["result"]).toBe(false);
    expect(service.getValidations()["result.a"]).toBe(false);
    expect(service.getValidations()["result.b"]).toBe(true);
  });

  test("loadDataKeyInvaildBecauseOfParentRule", async () => {
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
    })().setWith({}, {});

    await service.run();

    expect(service.getValidations()["result"]).toBe(false);
    expect(service.getValidations()["result.a"]).toBe(false);
    expect(service.getValidations()["result.a.c"]).toBe(false);
    expect(service.getValidations()["result.b"]).toBe(true);
    expect(service.getValidations()["result.b.c"]).toBe(true);
  });

  test("loadName", async () => {
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
    })().setWith(
      {},
      {
        result: "result name",
      },
    );

    await service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("result name");
  });

  test("loadNameBound", async () => {
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
    })().setWith({}, {});

    await service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("result name");
  });

  test("loadNameBoundNested", async () => {
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
    })().setWith(
      {},
      {
        result: "{{abcd}}",
        aaa: "aaaa",
        abcd: "{{aaa}} bbb ccc ddd",
      },
    );

    await service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("aaaa bbb ccc ddd");
  });

  test("loadNameBoundNested", async () => {
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
    })().setWith(
      {},
      {
        result: "{{abcd}}",
        aaa: "aaaa",
        abcd: "{{aaa}} bbb ccc ddd",
      },
    );

    await service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(service.getErrors()["result"][0]).toContain("aaaa bbb ccc ddd");
  });

  test("loadNameMultidimension", async () => {
    const service = new (class extends Service {
      public static getBindNames() {
        return {
          result: "result[...] name",
        };
      }

      public static getLoaders() {
        return {};
      }

      static getRuleLists() {
        return {
          result: [Joi.object(), Joi.required()],
          "result.a": [Joi.object(), Joi.required()],
          "result.a.b": [Joi.required()],
        };
      }
    })().setWith(
      {
        result: {
          a: {},
        },
      },
      {},
    );

    await service.run();

    expect(service.getErrors()).not.toEqual({});
    expect(Object.keys(service.getErrors()).includes("result.a.b")).toBe(true);
    expect(service.getErrors()["result.a.b"].length).toBe(1);
    expect(service.getErrors()["result.a.b"][0]).toContain("result[a][b] name");
  });
});
