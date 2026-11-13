// Helpers shared by the tests.

import { crc32, deflateRawSync } from "node:zlib";

/** A zip holding `files`, a map from path to text, each entry deflated. */
export function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const packed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A package archive whose manifest says `name` and `version`, with `extra` lines after them. */
export function makePackage(name, version, extra = "") {
  return makeZip({
    [`${name}/${name}.nyxp`]: `[package]\nname = "${name}"\nversion = "${version}"\n${extra}`,
    [`${name}/src/main.nyx`]: "module main\n",
  });
}

/** A GitHub release of `tag` carrying the given assets, each a name and the URL it downloads from. */
export function release(tag, assets) {
  return { tag_name: tag, draft: false, assets: assets.map(([name, url, digest]) => ({ name, browser_download_url: url, digest })) };
}
