import { createHash } from "crypto";
import { ICachedRecord, ImportMembers, Target } from "./types";

const hashImport = (target: Target, name: string, members: ImportMembers) => {
  const hash = createHash("sha1");
  hash.update(`${name}\0${target}\0`);
  if (typeof members === "string") {
    hash.update(`\0${members}`);
  } else {
    for (const id of members.sort()) {
      hash.update(`${id}\0`);
    }
  }

  return hash.digest().readBigUint64BE(0);
};

export class Cache {
  /** Deserializes a previous cache.serialize() */
  public static deserialize(buf: Buffer): Cache {
    const value = new Map<bigint, Promise<ICachedRecord> | ICachedRecord>();

    let offset = 0;
    while (offset < buf.length) {
      const key = buf.readBigUInt64BE(offset);
      offset += 8;
      const lastUsed = new Date(buf.readUInt32BE(offset) * 1000);
      offset += 4;
      const original = buf.readUInt32BE(offset);
      offset += 4;
      const compressed = buf.readUInt32BE(offset);
      offset += 4;

      value.set(key, { lastUsed, original, compressed });
    }

    return new Cache(value);
  }

  constructor(
    private readonly value: Map<bigint, Promise<ICachedRecord> | ICachedRecord> = new Map()
  ) {}

  /** Gets or replace the import value in the cache. */
  public async getOrReplace(
    target: Target,
    name: string,
    members: ImportMembers,
    onMissing: () => Promise<ICachedRecord> | ICachedRecord
  ): Promise<ICachedRecord> {
    const key = hashImport(target, name, members);
    const existing = this.value.get(key);
    if (existing) {
      return existing;
    }

    const newValue = onMissing();
    this.value.set(key, newValue);
    return newValue;
  }

  /** Serializes the buffer into a binary blob that's cached. */
  public async serialize(lastUsedThreshold: Date): Promise<Buffer> {
    const buf = Buffer.allocUnsafe(this.value.size * (8 + 4 + 4 + 4));
    let actualLen = 0;

    await Promise.all(
      [...this.value].map(async ([key, value]) => {
        const record = await value;
        if (record.lastUsed < lastUsedThreshold) {
          return;
        }

        actualLen = buf.writeBigUInt64BE(key, actualLen);
        actualLen = buf.writeUInt32BE(record.lastUsed.getTime() / 1000, actualLen);
        actualLen = buf.writeUInt32BE(record.original, actualLen);
        actualLen = buf.writeUInt32BE(record.compressed, actualLen);
      })
    );

    return buf.subarray(0, actualLen);
  }
}
