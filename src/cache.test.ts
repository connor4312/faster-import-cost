import { describe, expect, it } from "vitest";
import { Cache } from "./cache";
import { ICachedRecord, Target } from "./types";

describe("cache", () => {
  const testGetOrReplace = async () => {
    const cache = new Cache();
    const create = (): ICachedRecord => ({
      lastUsed: new Date(Math.round(Date.now() / 1000) * 1000),
      original: ++calls,
      compressed: 1,
    });

    let calls = 0;

    const a = await cache.getOrReplace(Target.nodeJS, "cockatiel", "all", create);
    expect(a.original).to.equal(1);

    const b = await cache.getOrReplace(Target.nodeJS, "cockatiel", "all", create);
    expect(b.original).to.equal(1);

    const c = await cache.getOrReplace(Target.nodeJS, "etcd3", "all", create);
    expect(c.original).to.equal(2);

    const d = await cache.getOrReplace(Target.nodeJS, "etcd3", ["foo", "bar"], create);
    expect(d.original).to.equal(3);

    const e = await cache.getOrReplace(Target.nodeJS, "etcd3", ["foo", "baz"], create);
    expect(e.original).to.equal(4);

    const f = await cache.getOrReplace(Target.nodeJS, "etcd3", "default", create);
    expect(f.original).to.equal(5);

    const g = await cache.getOrReplace(Target.browser, "etcd3", "default", create);
    expect(g.original).to.equal(6);

    expect(calls).to.equal(6);

    return cache;
  };

  it("getOrReplace", async () => {
    await testGetOrReplace();
  });

  it("serialize", async () => {
    const cache = await testGetOrReplace();
    const bytes = await cache.serialize(new Date(0));
    expect(Cache.deserialize(bytes)).to.deep.equal(cache);
  });
});
