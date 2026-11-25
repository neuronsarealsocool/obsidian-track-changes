/* Track Changes. Source: https://github.com/neuronsarealsocool/obsidian-track-changes */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TrackChanges
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// node_modules/diff/libesm/diff/base.js
var Diff = class {
  diff(oldStr, newStr, options = {}) {
    let callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if ("callback" in options) {
      callback = options.callback;
    }
    const oldString = this.castInput(oldStr, options);
    const newString = this.castInput(newStr, options);
    const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
    const newTokens = this.removeEmpty(this.tokenize(newString, options));
    return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
  }
  diffWithOptionsObj(oldTokens, newTokens, options, callback) {
    var _a;
    const done = (value) => {
      value = this.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return void 0;
      } else {
        return value;
      }
    };
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let editLength = 1;
    let maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    const maxExecutionTime = (_a = options.timeout) !== null && _a !== void 0 ? _a : Infinity;
    const abortAfterTimestamp = Date.now() + maxExecutionTime;
    const bestPath = [{ oldPos: -1, lastComponent: void 0 }];
    let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
    }
    let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    const execEditLength = () => {
      for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        let basePath;
        const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        let canAdd = false;
        if (addPath) {
          const addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        const canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = this.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = this.addToPath(removePath, false, true, 1, options);
        }
        newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    };
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback(void 0);
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        const ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  }
  addToPath(path3, added, removed, oldPosInc, options) {
    const last = path3.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path3.oldPos + oldPosInc,
        lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
      };
    } else {
      return {
        oldPos: path3.oldPos + oldPosInc,
        lastComponent: { count: 1, added, removed, previousComponent: last }
      };
    }
  }
  extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
    }
    basePath.oldPos = oldPos;
    return newPos;
  }
  equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  }
  removeEmpty(array) {
    const ret = [];
    for (let i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  castInput(value, options) {
    return value;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenize(value, options) {
    return Array.from(value);
  }
  join(chars) {
    return chars.join("");
  }
  postProcess(changeObjects, options) {
    return changeObjects;
  }
  get useLongestToken() {
    return false;
  }
  buildValues(lastComponent, newTokens, oldTokens) {
    const components = [];
    let nextComponent;
    while (lastComponent) {
      components.push(lastComponent);
      nextComponent = lastComponent.previousComponent;
      delete lastComponent.previousComponent;
      lastComponent = nextComponent;
    }
    components.reverse();
    const componentLen = components.length;
    let componentPos = 0, newPos = 0, oldPos = 0;
    for (; componentPos < componentLen; componentPos++) {
      const component = components[componentPos];
      if (!component.removed) {
        if (!component.added && this.useLongestToken) {
          let value = newTokens.slice(newPos, newPos + component.count);
          value = value.map(function(value2, i) {
            const oldValue = oldTokens[oldPos + i];
            return oldValue.length > value2.length ? oldValue : value2;
          });
          component.value = this.join(value);
        } else {
          component.value = this.join(newTokens.slice(newPos, newPos + component.count));
        }
        newPos += component.count;
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
        oldPos += component.count;
      }
    }
    return components;
  }
};

// node_modules/diff/libesm/diff/character.js
var CharacterDiff = class extends Diff {
};
var characterDiff = new CharacterDiff();
function diffChars(oldStr, newStr, options) {
  return characterDiff.diff(oldStr, newStr, options);
}

// node_modules/diff/libesm/util/string.js
function longestCommonPrefix(str1, str2) {
  let i;
  for (i = 0; i < str1.length && i < str2.length; i++) {
    if (str1[i] != str2[i]) {
      return str1.slice(0, i);
    }
  }
  return str1.slice(0, i);
}
function longestCommonSuffix(str1, str2) {
  let i;
  if (!str1 || !str2 || str1[str1.length - 1] != str2[str2.length - 1]) {
    return "";
  }
  for (i = 0; i < str1.length && i < str2.length; i++) {
    if (str1[str1.length - (i + 1)] != str2[str2.length - (i + 1)]) {
      return str1.slice(-i);
    }
  }
  return str1.slice(-i);
}
function replacePrefix(string, oldPrefix, newPrefix) {
  if (string.slice(0, oldPrefix.length) != oldPrefix) {
    throw Error(`string ${JSON.stringify(string)} doesn't start with prefix ${JSON.stringify(oldPrefix)}; this is a bug`);
  }
  return newPrefix + string.slice(oldPrefix.length);
}
function replaceSuffix(string, oldSuffix, newSuffix) {
  if (!oldSuffix) {
    return string + newSuffix;
  }
  if (string.slice(-oldSuffix.length) != oldSuffix) {
    throw Error(`string ${JSON.stringify(string)} doesn't end with suffix ${JSON.stringify(oldSuffix)}; this is a bug`);
  }
  return string.slice(0, -oldSuffix.length) + newSuffix;
}
function removePrefix(string, oldPrefix) {
  return replacePrefix(string, oldPrefix, "");
}
function removeSuffix(string, oldSuffix) {
  return replaceSuffix(string, oldSuffix, "");
}
function maximumOverlap(string1, string2) {
  return string2.slice(0, overlapCount(string1, string2));
}
function overlapCount(a, b) {
  let startA = 0;
  if (a.length > b.length) {
    startA = a.length - b.length;
  }
  let endB = b.length;
  if (a.length < b.length) {
    endB = a.length;
  }
  const map = Array(endB);
  let k = 0;
  map[0] = 0;
  for (let j = 1; j < endB; j++) {
    if (b[j] == b[k]) {
      map[j] = map[k];
    } else {
      map[j] = k;
    }
    while (k > 0 && b[j] != b[k]) {
      k = map[k];
    }
    if (b[j] == b[k]) {
      k++;
    }
  }
  k = 0;
  for (let i = startA; i < a.length; i++) {
    while (k > 0 && a[i] != b[k]) {
      k = map[k];
    }
    if (a[i] == b[k]) {
      k++;
    }
  }
  return k;
}
function segment(string, segmenter) {
  const parts = [];
  for (const segmentObj of Array.from(segmenter.segment(string))) {
    const segment2 = segmentObj.segment;
    if (parts.length && /\s/.test(parts[parts.length - 1]) && /\s/.test(segment2)) {
      parts[parts.length - 1] += segment2;
    } else {
      parts.push(segment2);
    }
  }
  return parts;
}
function trailingWs(string, segmenter) {
  if (segmenter) {
    return leadingAndTrailingWs(string, segmenter)[1];
  }
  let i;
  for (i = string.length - 1; i >= 0; i--) {
    if (!string[i].match(/\s/)) {
      break;
    }
  }
  return string.substring(i + 1);
}
function leadingWs(string, segmenter) {
  if (segmenter) {
    return leadingAndTrailingWs(string, segmenter)[0];
  }
  const match = string.match(/^\s*/);
  return match ? match[0] : "";
}
function leadingAndTrailingWs(string, segmenter) {
  if (!segmenter) {
    return [leadingWs(string), trailingWs(string)];
  }
  if (segmenter.resolvedOptions().granularity != "word") {
    throw new Error('The segmenter passed must have a granularity of "word"');
  }
  const segments = segment(string, segmenter);
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  const head = /\s/.test(firstSeg) ? firstSeg : "";
  const tail = /\s/.test(lastSeg) ? lastSeg : "";
  return [head, tail];
}

// node_modules/diff/libesm/diff/word.js
var extendedWordChars = "a-zA-Z0-9_\\u{AD}\\u{C0}-\\u{D6}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";
var tokenizeIncludingWhitespace = new RegExp(`[${extendedWordChars}]+|\\s+|[^${extendedWordChars}]`, "ug");
var WordDiff = class extends Diff {
  equals(left, right, options) {
    if (options.ignoreCase) {
      left = left.toLowerCase();
      right = right.toLowerCase();
    }
    return left.trim() === right.trim();
  }
  tokenize(value, options = {}) {
    let parts;
    if (options.intlSegmenter) {
      const segmenter = options.intlSegmenter;
      if (segmenter.resolvedOptions().granularity != "word") {
        throw new Error('The segmenter passed must have a granularity of "word"');
      }
      parts = segment(value, segmenter);
    } else {
      parts = value.match(tokenizeIncludingWhitespace) || [];
    }
    const tokens = [];
    let prevPart = null;
    parts.forEach((part) => {
      if (/\s/.test(part)) {
        if (prevPart == null) {
          tokens.push(part);
        } else {
          tokens.push(tokens.pop() + part);
        }
      } else if (prevPart != null && /\s/.test(prevPart)) {
        if (tokens[tokens.length - 1] == prevPart) {
          tokens.push(tokens.pop() + part);
        } else {
          tokens.push(prevPart + part);
        }
      } else {
        tokens.push(part);
      }
      prevPart = part;
    });
    return tokens;
  }
  join(tokens) {
    return tokens.map((token, i) => {
      if (i == 0) {
        return token;
      } else {
        return token.replace(/^\s+/, "");
      }
    }).join("");
  }
  postProcess(changes2, options) {
    if (!changes2 || options.oneChangePerToken) {
      return changes2;
    }
    let lastKeep = null;
    let insertion = null;
    let deletion = null;
    changes2.forEach((change) => {
      if (change.added) {
        insertion = change;
      } else if (change.removed) {
        deletion = change;
      } else {
        if (insertion || deletion) {
          dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, change, options.intlSegmenter);
        }
        lastKeep = change;
        insertion = null;
        deletion = null;
      }
    });
    if (insertion || deletion) {
      dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, null, options.intlSegmenter);
    }
    return changes2;
  }
};
var wordDiff = new WordDiff();
function dedupeWhitespaceInChangeObjects(startKeep, deletion, insertion, endKeep, segmenter) {
  if (deletion && insertion) {
    const [oldWsPrefix, oldWsSuffix] = leadingAndTrailingWs(deletion.value, segmenter);
    const [newWsPrefix, newWsSuffix] = leadingAndTrailingWs(insertion.value, segmenter);
    if (startKeep) {
      const commonWsPrefix = longestCommonPrefix(oldWsPrefix, newWsPrefix);
      startKeep.value = replaceSuffix(startKeep.value, newWsPrefix, commonWsPrefix);
      deletion.value = removePrefix(deletion.value, commonWsPrefix);
      insertion.value = removePrefix(insertion.value, commonWsPrefix);
    }
    if (endKeep) {
      const commonWsSuffix = longestCommonSuffix(oldWsSuffix, newWsSuffix);
      endKeep.value = replacePrefix(endKeep.value, newWsSuffix, commonWsSuffix);
      deletion.value = removeSuffix(deletion.value, commonWsSuffix);
      insertion.value = removeSuffix(insertion.value, commonWsSuffix);
    }
  } else if (insertion) {
    if (startKeep) {
      const ws = leadingWs(insertion.value, segmenter);
      insertion.value = insertion.value.substring(ws.length);
    }
    if (endKeep) {
      const ws = leadingWs(endKeep.value, segmenter);
      endKeep.value = endKeep.value.substring(ws.length);
    }
  } else if (startKeep && endKeep) {
    const newWsFull = leadingWs(endKeep.value, segmenter), [delWsStart, delWsEnd] = leadingAndTrailingWs(deletion.value, segmenter);
    const newWsStart = longestCommonPrefix(newWsFull, delWsStart);
    deletion.value = removePrefix(deletion.value, newWsStart);
    const newWsEnd = longestCommonSuffix(removePrefix(newWsFull, newWsStart), delWsEnd);
    deletion.value = removeSuffix(deletion.value, newWsEnd);
    endKeep.value = replacePrefix(endKeep.value, newWsFull, newWsEnd);
    startKeep.value = replaceSuffix(startKeep.value, newWsFull, newWsFull.slice(0, newWsFull.length - newWsEnd.length));
  } else if (endKeep) {
    const endKeepWsPrefix = leadingWs(endKeep.value, segmenter);
    const deletionWsSuffix = trailingWs(deletion.value, segmenter);
    const overlap = maximumOverlap(deletionWsSuffix, endKeepWsPrefix);
    deletion.value = removeSuffix(deletion.value, overlap);
  } else if (startKeep) {
    const startKeepWsSuffix = trailingWs(startKeep.value, segmenter);
    const deletionWsPrefix = leadingWs(deletion.value, segmenter);
    const overlap = maximumOverlap(startKeepWsSuffix, deletionWsPrefix);
    deletion.value = removePrefix(deletion.value, overlap);
  }
}
var WordsWithSpaceDiff = class extends Diff {
  tokenize(value) {
    const regex = new RegExp(`(\\r?\\n)|[${extendedWordChars}]+|[^\\S\\n\\r]+|[^${extendedWordChars}]`, "ug");
    return value.match(regex) || [];
  }
};
var wordsWithSpaceDiff = new WordsWithSpaceDiff();
function diffWordsWithSpace(oldStr, newStr, options) {
  return wordsWithSpaceDiff.diff(oldStr, newStr, options);
}

// node_modules/diff/libesm/diff/array.js
var ArrayDiff = class extends Diff {
  tokenize(value) {
    return value.slice();
  }
  join(value) {
    return value;
  }
  removeEmpty(value) {
    return value;
  }
};
var arrayDiff = new ArrayDiff();
function diffArrays(oldArr, newArr, options) {
  return arrayDiff.diff(oldArr, newArr, options);
}

// src/main.ts
var import_node_path2 = __toESM(require("node:path"));
var import_node_os = __toESM(require("node:os"));

// src/storage.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var import_node_crypto = require("node:crypto");
var import_node_zlib = require("node:zlib");
var Archive = class {
  constructor(root) {
    this.root = root;
  }
  docs = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  queue = Promise.resolve();
  static vaultId(vaultPath) {
    return (0, import_node_crypto.createHash)("sha256").update(import_node_path.default.resolve(vaultPath).replaceAll("\\", "/").toLowerCase()).digest("hex").slice(0, 24);
  }
  serial(job) {
    const task = this.queue.then(job);
    this.queue = task.catch(() => {
    });
    return task;
  }
  async init() {
    await import_node_fs.promises.mkdir(this.root, { recursive: true });
    const errors = [];
    for (const entry of await import_node_fs.promises.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      const files = (await import_node_fs.promises.readdir(import_node_path.default.join(this.root, entry.name))).filter((n) => n.endsWith(".json.gz")).sort().reverse();
      for (const name of files) {
        try {
          const r = await this.read(entry.name, name);
          this.docs.set(r.docId, r);
          break;
        } catch {
          errors.push(`${entry.name}/${name}`);
        }
      }
    }
    for (const r of [...this.docs.values()].sort((a, b) => a.id.localeCompare(b.id))) if (!r.deleted) this.active.set(r.path, r.docId);
    if (errors.length) throw new Error(`Unreadable archive revisions (${errors.length}); files preserved. First: ${errors[0]}`);
  }
  get(notePath) {
    const id = this.active.get(notePath);
    return id ? this.docs.get(id) : void 0;
  }
  async read(docId, name) {
    if (!/^[a-f0-9-]{36}$/.test(docId) || !/^\d+-[a-f0-9-]+\.json\.gz$/.test(name)) throw Error("Invalid revision path");
    const r = JSON.parse((0, import_node_zlib.gunzipSync)(await import_node_fs.promises.readFile(import_node_path.default.join(this.root, docId, name))).toString("utf8"));
    if (r.schema !== 1 || r.docId !== docId || typeof r.content !== "string" || typeof r.baseline !== "string" || typeof r.path !== "string" || !Array.isArray(r.aliases) || typeof r.deleted !== "boolean") throw Error("Invalid revision");
    return r;
  }
  async list(docId) {
    if (!/^[a-f0-9-]{36}$/.test(docId)) throw Error("Invalid document");
    return (await import_node_fs.promises.readdir(import_node_path.default.join(this.root, docId))).filter((n) => /^\d+-[a-f0-9-]+\.json\.gz$/.test(n)).sort().reverse();
  }
  async load(docId, name) {
    return this.read(docId, name);
  }
  save(notePath, content, kind = "edit", options = {}) {
    return this.serial(async () => {
      const old = options.docId ? this.docs.get(options.docId) : this.get(options.oldPath ?? notePath);
      const baseline = options.baseline ?? old?.baseline ?? content;
      if (old && old.content === content && old.baseline === baseline && old.path === notePath && old.deleted === (options.deleted ?? false) && kind === "edit") return old;
      const docId = old?.docId ?? (0, import_node_crypto.randomUUID)();
      const last = old ? Number(old.id.split("-")[0]) : 0;
      const id = `${Math.max(Date.now(), last + 1)}-${(0, import_node_crypto.randomUUID)()}`;
      const r = { schema: 1, id, docId, time: (/* @__PURE__ */ new Date()).toISOString(), path: notePath, aliases: [.../* @__PURE__ */ new Set([...old?.aliases ?? [], notePath])], kind, content, baseline, deleted: options.deleted ?? false, ...options.label ? { label: options.label } : {} };
      const dir = import_node_path.default.join(this.root, docId);
      await import_node_fs.promises.mkdir(dir, { recursive: true });
      const destination = import_node_path.default.join(dir, `${id}.json.gz`), tmp = `${destination}.tmp`;
      const handle = await import_node_fs.promises.open(tmp, "wx");
      try {
        await handle.writeFile((0, import_node_zlib.gzipSync)(JSON.stringify(r)));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await import_node_fs.promises.rename(tmp, destination);
      if (old) this.active.delete(old.path);
      this.docs.set(docId, r);
      if (!r.deleted) this.active.set(notePath, docId);
      return r;
    });
  }
  async idle() {
    await this.queue;
  }
};

// src/changes.ts
function changes(base, current, wholeWords = false) {
  let oldPos = 0, pos = 0;
  const out = [];
  let pending;
  const parts = base.length + current.length > 4e5 ? null : (wholeWords ? diffWordsWithSpace : diffChars)(base, current, { timeout: 150 });
  if (!parts) return base === current ? [] : [{ from: 0, to: current.length, oldFrom: 0, oldTo: base.length, removed: base, added: current }];
  for (const part of parts) {
    if (!part.added && !part.removed) {
      if (pending) {
        out.push(pending);
        pending = void 0;
      }
      pos += part.value.length;
      oldPos += part.value.length;
      continue;
    }
    pending ??= { from: pos, to: pos, oldFrom: oldPos, oldTo: oldPos, removed: "", added: "" };
    if (part.removed) {
      pending.removed += part.value;
      oldPos += part.value.length;
      pending.oldTo = oldPos;
    }
    if (part.added) {
      pending.added += part.value;
      pos += part.value.length;
      pending.to = pos;
    }
  }
  if (pending) out.push(pending);
  return out;
}
function acceptOne(base, change) {
  return base.slice(0, change.oldFrom) + change.added + base.slice(change.oldTo);
}
function rejectOne(current, change) {
  return current.slice(0, change.from) + change.removed + current.slice(change.to);
}

// src/inline-review.ts
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");

// src/paragraphs.ts
function paragraphs(text) {
  const result = [];
  let from = 0, match;
  const separators = /\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/g;
  while (match = separators.exec(text)) {
    const to = match.index + match[0].length;
    result.push({ from, bodyTo: match.index, to, body: text.slice(from, match.index), separator: match[0], text: text.slice(from, to) });
    from = to;
  }
  if (from < text.length) result.push({ from, bodyTo: text.length, to: text.length, body: text.slice(from), separator: "", text: text.slice(from) });
  return result;
}

// src/review-areas.ts
function reviewAreas(base, current) {
  const old = paragraphs(base), now = paragraphs(current), pending = [];
  const currentMeta = (p) => ({ paragraphFrom: p.from, paragraphTo: p.bodyTo });
  function paired(a, b, index) {
    const metadata = { ...currentMeta(b), oldParagraphFrom: a.from, oldParagraphTo: a.bodyTo };
    for (const kind of ["body", "separator"]) {
      const before = kind === "body" ? a.body : a.separator, after = kind === "body" ? b.body : b.separator;
      if (before === after) continue;
      const edits = changes(before, after, true);
      if (!edits.length) continue;
      const first = edits[0], last = edits.at(-1), oldOffset = kind === "body" ? a.from : a.bodyTo, offset = kind === "body" ? b.from : b.bodyTo;
      const from = offset + first.from, to = offset + last.to, oldFrom = oldOffset + first.oldFrom, oldTo = oldOffset + last.oldTo;
      pending.push({ kind, paragraph: index, area: { from, to, oldFrom, oldTo, removed: base.slice(oldFrom, oldTo), added: current.slice(from, to), anchor: Math.max(b.bodyTo, to), ...metadata } });
    }
  }
  function inserted(b, point, index) {
    pending.push({ kind: "insert", paragraph: index, area: { from: b.from, to: b.to, oldFrom: point, oldTo: point, removed: "", added: b.text, anchor: b.to, ...currentMeta(b) } });
  }
  function deleted(a, point) {
    pending.push({ kind: "delete", area: { from: point, to: point, oldFrom: a.from, oldTo: a.to, removed: a.text, added: "", anchor: point, oldParagraphFrom: a.from, oldParagraphTo: a.bodyTo } });
  }
  let oi = 0, ni = 0, oldRun = [], newRun = [], oldStart = 0, newStart = 0;
  function flush() {
    if (!oldRun.length && !newRun.length) return;
    const common = Math.min(oldRun.length, newRun.length);
    let oldPoint = old[oldStart]?.from ?? base.length, point = now[newStart]?.from ?? current.length;
    for (let i = 0; i < common; i++) {
      paired(oldRun[i], newRun[i], newStart + i);
      oldPoint = oldRun[i].to;
      point = newRun[i].to;
    }
    for (let i = common; i < oldRun.length; i++) {
      deleted(oldRun[i], point);
      oldPoint = oldRun[i].to;
    }
    for (let i = common; i < newRun.length; i++) inserted(newRun[i], oldPoint, newStart + i);
    oldRun = [];
    newRun = [];
  }
  const parts = diffArrays(old.map((p) => p.body), now.map((p) => p.body), { timeout: 150 }) ?? [{ removed: true, value: old.map((p) => p.body) }, { added: true, value: now.map((p) => p.body) }];
  for (const part of parts) {
    if (!part.added && !part.removed) {
      flush();
      for (let i = 0; i < part.value.length; i++) paired(old[oi++], now[ni], ni++);
    } else {
      if (!oldRun.length && !newRun.length) {
        oldStart = oi;
        newStart = ni;
      }
      if (part.removed) {
        oldRun.push(...old.slice(oi, oi + part.value.length));
        oi += part.value.length;
      }
      if (part.added) {
        newRun.push(...now.slice(ni, ni + part.value.length));
        ni += part.value.length;
      }
    }
  }
  flush();
  function merge(target, extra) {
    target.from = Math.min(target.from, extra.from);
    target.to = Math.max(target.to, extra.to);
    target.oldFrom = Math.min(target.oldFrom, extra.oldFrom);
    target.oldTo = Math.max(target.oldTo, extra.oldTo);
    target.removed = base.slice(target.oldFrom, target.oldTo);
    target.added = current.slice(target.from, target.to);
    target.anchor = Math.max(target.anchor, target.to);
  }
  const removed = /* @__PURE__ */ new Set();
  for (const item of pending.filter((p) => p.kind === "separator")) {
    const a = item.area;
    const neighbour = pending.find((p) => p.kind === "insert" && a.to === p.area.from && a.oldTo === p.area.oldFrom) ?? pending.find((p) => p.kind === "delete" && a.to === p.area.from && a.oldTo === p.area.oldFrom);
    const target = neighbour ?? pending.find((p) => p.kind === "body" && p.paragraph === item.paragraph);
    if (target) {
      merge(target.area, a);
      removed.add(item);
    }
  }
  return pending.filter((p) => !removed.has(p)).map((p) => p.area).sort((a, b) => a.from - b.from || a.oldFrom - b.oldFrom);
}

// src/area-history.ts
function areaRange(text, area) {
  if (area.paragraphFrom !== void 0 && area.paragraphTo !== void 0 && area.paragraphFrom >= 0 && area.paragraphTo >= area.paragraphFrom && area.paragraphTo <= text.length) return { from: area.paragraphFrom, to: area.paragraphTo };
  if (area.from === area.to) return { from: area.from, to: area.to };
  let from = 0;
  const separators = /\r?\n[\t ]*\r?\n/g;
  let match;
  while ((match = separators.exec(text)) && match.index + match[0].length <= area.from) from = match.index + match[0].length;
  let to = area.anchor;
  separators.lastIndex = 0;
  while (match = separators.exec(text)) if (match.index < to && to <= match.index + match[0].length) {
    to = match.index;
    break;
  }
  return from <= to ? { from, to } : { from: area.from, to: area.to };
}
function mapAreaRange(newer, older, range) {
  if (range.from < 0 || range.to < range.from || range.to > newer.length) throw Error("Invalid area range");
  const edits = changes(newer, older, true);
  for (const c of edits) {
    const crossesStart = c.oldFrom < range.from && c.oldTo > range.from && newer.slice(c.oldFrom, range.from).trim() !== "";
    const crossesEnd = c.oldFrom < range.to && c.oldTo > range.to && newer.slice(range.to, c.oldTo).trim() !== "";
    if ((crossesStart || crossesEnd) && c.added.trim() !== "") return { reason: "An earlier rewrite also changed surrounding text. Its area cannot be isolated safely." };
  }
  function position(offset, side) {
    let delta = 0;
    for (const c of edits) {
      if (offset < c.oldFrom) break;
      if (c.oldFrom === c.oldTo && offset === c.oldFrom) return side > 0 ? c.to : c.from;
      if (offset <= c.oldTo) {
        if (offset === c.oldFrom) return c.from;
        if (offset === c.oldTo) return c.to;
        return side > 0 ? c.from : c.to;
      }
      delta += c.to - c.from - (c.oldTo - c.oldFrom);
    }
    return offset + delta;
  }
  let from = position(range.from, 1), to = position(range.to, -1);
  if (range.from < range.to) {
    const startsParagraph = range.from === 0 || /\r?\n[\t ]*\r?\n$/.test(newer.slice(0, range.from));
    const endsParagraph = range.to === newer.length || /^\r?\n[\t ]*\r?\n/.test(newer.slice(range.to));
    if (startsParagraph && endsParagraph && from < to) {
      let start = 0, end = older.length, match;
      const separators = /\r?\n[\t ]*\r?\n/g;
      while (match = separators.exec(older)) {
        const after = match.index + match[0].length;
        if (after <= from) start = after;
        if (match.index >= to || match.index < to && to <= after) {
          end = match.index;
          break;
        }
      }
      from = start;
      to = end;
    }
  }
  if (range.from === range.to) {
    const restored = edits.find((c) => c.oldFrom === range.from && c.oldTo === range.to);
    if (restored) {
      from = restored.from;
      to = restored.to;
    }
  }
  if (from > to) return { reason: "The older area boundary is ambiguous." };
  const currentText = newer.slice(range.from, range.to), oldText = older.slice(from, to);
  if (paragraphs(currentText).filter((p) => p.body.trim()).length <= 1 && range.from < range.to && paragraphs(oldText).filter((p) => p.body.trim()).length > 1) return { reason: "This earlier version split or joined the paragraph. Its text cannot be isolated safely." };
  const overlaps = edits.some((c) => c.oldFrom < range.to && c.oldTo > range.from);
  const repeated = (document2, value) => !!value && document2.indexOf(value) !== document2.lastIndexOf(value);
  if (overlaps && oldText && (repeated(newer, currentText) || repeated(older, oldText))) return { reason: "Repeated text makes this earlier area ambiguous. Use the full-note history to compare it." };
  return { range: { from, to } };
}
var AreaHistory = class {
  constructor(source, path3, text, currentRange, origin) {
    this.source = source;
    this.currentRange = currentRange;
    this.docId = source.get(path3)?.docId;
    this.document = text;
    this.range = { ...currentRange };
    if (currentRange.from === currentRange.to && origin) this.deletionOrigin = origin;
    this.entries = [{ text: text.slice(currentRange.from, currentRange.to), kind: "current" }];
    if (!this.docId) {
      this.finished = true;
      this.stopReason = "No saved revisions for this area yet.";
    }
  }
  entries;
  position = 0;
  finished = false;
  stopReason = "";
  document;
  range;
  names;
  cursor = 0;
  docId;
  deletionOrigin;
  get selected() {
    return this.entries[this.position];
  }
  get hasNewer() {
    return this.position > 0;
  }
  get hasOlder() {
    return this.position < this.entries.length - 1 || !this.finished;
  }
  newer() {
    if (this.hasNewer) this.position--;
    return this.selected;
  }
  async older(keepReading = () => true) {
    if (this.position < this.entries.length - 1) {
      this.position++;
      return this.selected;
    }
    if (this.finished || !this.docId) return this.selected;
    this.names ??= await this.source.list(this.docId);
    while (this.cursor < this.names.length) {
      if (!keepReading()) return this.selected;
      const revision = await this.source.load(this.docId, this.names[this.cursor]);
      this.cursor++;
      if (!keepReading()) return this.selected;
      if (revision.content === this.document) continue;
      const mapped = mapAreaRange(this.deletionOrigin?.document ?? this.document, revision.content, this.deletionOrigin?.range ?? this.range);
      if (!mapped.range) {
        this.finished = true;
        this.stopReason = mapped.reason;
        return this.selected;
      }
      if (this.deletionOrigin && mapped.range.from === mapped.range.to) continue;
      this.deletionOrigin = void 0;
      this.document = revision.content;
      this.range = mapped.range;
      const text = revision.content.slice(this.range.from, this.range.to);
      if (text === this.entries.at(-1).text) continue;
      this.entries.push({ text, time: revision.time, id: revision.id, label: revision.label, kind: revision.kind });
      this.position++;
      if (this.range.from === this.range.to) {
        this.finished = true;
        this.stopReason = "This area was not present in earlier saved versions.";
      } else if (this.cursor === this.names.length) {
        this.finished = true;
        this.stopReason = "No earlier revisions of this area.";
      }
      return this.selected;
    }
    this.finished = true;
    this.stopReason = "No earlier revisions of this area.";
    return this.selected;
  }
};

// src/inline-review.ts
var HistoricalText = class extends import_view.WidgetType {
  constructor(text, current, index) {
    super();
    this.text = text;
    this.current = current;
    this.index = index;
  }
  eq(other) {
    return this.text === other.text && this.current === other.current && this.index === other.index;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "tc-inplace-preview";
    el.dataset.tcArea = String(this.index);
    el.contentEditable = "false";
    el.setAttribute("aria-label", "Temporary historical revision preview");
    el.setAttribute("role", "note");
    const text = document.createElement("span");
    text.className = "tc-inplace-text";
    el.appendChild(text);
    let offset = 0;
    for (const change of changes(this.current, this.text, true)) {
      text.appendChild(document.createTextNode(this.current.slice(offset, change.oldFrom)));
      if (change.removed) {
        const removed = document.createElement("del");
        removed.className = "tc-preview-deletion tc-deletion";
        removed.textContent = change.removed;
        removed.setAttribute("aria-label", `Current text removed in this preview: ${change.removed}`);
        text.appendChild(removed);
      }
      if (change.added) {
        const added = document.createElement("ins");
        added.className = "tc-preview-addition tc-addition";
        added.textContent = change.added;
        added.setAttribute("aria-label", `Selected revision text: ${change.added}`);
        text.appendChild(added);
      }
      offset = change.oldTo;
    }
    text.appendChild(document.createTextNode(this.current.slice(offset)));
    if (!this.text) {
      const empty = document.createElement("span");
      empty.className = "tc-preview-empty";
      empty.textContent = "(Area not present in this revision)";
      text.appendChild(empty);
    }
    return el;
  }
  ignoreEvent() {
    return true;
  }
};
var DeletedText = class extends import_view.WidgetType {
  constructor(text, areaIndex) {
    super();
    this.text = text;
    this.areaIndex = areaIndex;
  }
  eq(other) {
    return other.text === this.text && other.areaIndex === this.areaIndex;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "tc-deletion";
    span.textContent = this.text;
    span.dataset.tcArea = String(this.areaIndex);
    span.setAttribute("aria-label", `Deleted: ${this.text}`);
    return span;
  }
};
function preview(text) {
  const value = text.replace(/\r?\n/g, " \u21B5 ");
  return value.trim() ? value.length > 130 ? `${value.slice(0, 130)}\u2026` : value : "Whitespace";
}
var ReviewBox = class extends import_view.WidgetType {
  constructor(host, path3, base, text, area, index, total, setPreview) {
    super();
    this.host = host;
    this.path = path3;
    this.base = base;
    this.text = text;
    this.area = area;
    this.index = index;
    this.total = total;
    this.setPreview = setPreview;
  }
  eq(other) {
    return this.host === other.host && this.path === other.path && this.base === other.base && this.text === other.text && this.index === other.index && this.total === other.total;
  }
  toDOM(view) {
    const wrapper = document.createElement("div");
    wrapper.className = "tc-inline-container";
    wrapper.contentEditable = "false";
    wrapper.dataset.tcArea = String(this.index);
    const card = document.createElement("div");
    card.className = "tc-inline-review is-active";
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `Review change ${this.index + 1} of ${this.total}`);
    card.dataset.changeIndex = String(this.index);
    card.dataset.from = String(this.area.from);
    wrapper.appendChild(card);
    const heading = document.createElement("div");
    heading.className = "tc-inline-header";
    card.appendChild(heading);
    const title = document.createElement("span");
    title.className = "tc-inline-title";
    title.textContent = this.area.removed ? this.area.added ? "Changed text" : "Deleted text" : "Added text";
    heading.appendChild(title);
    const count = document.createElement("span");
    count.className = "tc-inline-count";
    count.textContent = "Pending edit";
    heading.appendChild(count);
    const summary = document.createElement("div");
    summary.className = "tc-inline-preview";
    card.appendChild(summary);
    if (this.area.removed) {
      const old = document.createElement("del");
      old.textContent = preview(this.area.removed);
      old.setAttribute("aria-label", `Previous text: ${this.area.removed}`);
      summary.appendChild(old);
    }
    if (this.area.added) {
      const added = document.createElement("ins");
      added.textContent = preview(this.area.added);
      added.setAttribute("aria-label", `New text: ${this.area.added}`);
      summary.appendChild(added);
    }
    const controls = document.createElement("div");
    controls.className = "tc-inline-controls";
    card.appendChild(controls);
    const addButton = (label, action, run, disabled = false, parent = controls) => {
      const button2 = document.createElement("button");
      button2.type = "button";
      button2.textContent = label;
      button2.dataset.action = action;
      button2.disabled = disabled;
      button2.setAttribute("aria-label", action === "previous" ? "Previous revision of this area" : action === "next" ? "Next revision of this area" : `${label} this changed area`);
      button2.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void run();
      });
      parent.appendChild(button2);
      return button2;
    };
    const decide = async (accept2) => {
      if (card.getAttribute("aria-busy") === "true") return;
      const enabled = Array.from(card.querySelectorAll("button")).filter((b) => !b.disabled);
      enabled.forEach((b) => b.disabled = true);
      card.setAttribute("aria-busy", "true");
      try {
        if (view.state.doc.toString() !== this.text) throw Error("The note changed while reviewing. Use its updated review box.");
        this.setPreview(view, null);
        await this.host.applyChange(this.path, this.text, this.base, this.area, accept2);
        view.dispatch({});
      } catch (error) {
        new import_obsidian.Notice(String(error), 9e3);
      } finally {
        card.removeAttribute("aria-busy");
        enabled.forEach((b) => b.disabled = false);
      }
    };
    const accept = addButton("Accept", "accept", () => decide(true));
    accept.classList.add("tc-inline-accept");
    const reject = addButton("Reject", "reject", () => decide(false));
    const origin = this.area.paragraphFrom === void 0 && this.area.from === this.area.to ? { document: this.base, range: { from: this.area.oldFrom, to: this.area.oldTo } } : void 0;
    const history = new AreaHistory(this.host.archive, this.path, this.text, areaRange(this.text, this.area), origin);
    const section = document.createElement("div");
    section.className = "tc-area-history";
    card.appendChild(section);
    const historyTitle = document.createElement("div");
    historyTitle.className = "tc-area-history-title";
    historyTitle.textContent = "This area\u2019s revisions";
    section.appendChild(historyTitle);
    const status = document.createElement("div");
    status.className = "tc-area-history-status";
    status.setAttribute("aria-live", "polite");
    section.appendChild(status);
    const historyControls = document.createElement("div");
    historyControls.className = "tc-inline-controls";
    section.appendChild(historyControls);
    const note = document.createElement("div");
    note.className = "tc-area-history-note";
    section.appendChild(note);
    let loading = false;
    const current = () => view.state.doc.toString() === this.text && this.host.archive.get(this.path)?.baseline === this.base;
    const renderHistory = () => {
      status.textContent = loading ? "Loading earlier revisions\u2026" : history.position === 0 ? "Current text" : `Preview vs current \xB7 ${history.selected.label ? `${history.selected.label} \xB7 ` : ""}${new Date(history.selected.time).toLocaleString()}`;
      previous.disabled = loading || !history.hasOlder;
      next.disabled = loading || !history.hasNewer;
      restore.hidden = history.position === 0;
      restore.disabled = loading || history.selected.text === history.entries[0].text;
      cancel.hidden = history.position === 0;
      cancel.disabled = loading;
      accept.disabled = loading || history.position > 0;
      reject.disabled = loading || history.position > 0;
      note.textContent = !history.hasOlder ? history.stopReason : "";
      note.hidden = !note.textContent;
      if (card.isConnected && current()) this.setPreview(view, history.position === 0 ? null : { path: this.path, base: this.base, original: this.text, index: this.index, range: history.currentRange, text: history.selected.text });
      view.requestMeasure();
    };
    const browse = async (older) => {
      if (loading) return;
      if (!current()) {
        view.dispatch({});
        return;
      }
      loading = true;
      renderHistory();
      try {
        if (older) await history.older(() => card.isConnected && current());
        else history.newer();
      } catch (error) {
        new import_obsidian.Notice(`Could not load this area's revisions: ${String(error)}`, 9e3);
      } finally {
        loading = false;
        if (card.isConnected) renderHistory();
      }
    };
    const useRevision = async () => {
      if (loading || history.position === 0) return;
      if (!current()) {
        view.dispatch({});
        return;
      }
      const enabled = Array.from(card.querySelectorAll("button")).filter((b) => !b.disabled);
      enabled.forEach((b) => b.disabled = true);
      card.setAttribute("aria-busy", "true");
      try {
        this.setPreview(view, null);
        await this.host.restoreAreaVersion(this.path, this.text, this.base, history.currentRange, history.selected.text);
        view.dispatch({});
      } catch (error) {
        new import_obsidian.Notice(String(error), 9e3);
      } finally {
        card.removeAttribute("aria-busy");
        enabled.forEach((b) => b.disabled = false);
      }
    };
    const previous = addButton("\u2190 Previous revision", "previous", () => browse(true), false, historyControls);
    const next = addButton("Next revision \u2192", "next", () => browse(false), true, historyControls);
    const restore = addButton("Use this revision", "restore-area", () => useRevision(), true, historyControls);
    const cancel = addButton("Cancel preview", "cancel-preview", () => {
      history.position = 0;
      renderHistory();
    }, false, historyControls);
    renderHistory();
    return wrapper;
  }
  // Keep buttons keyboard-accessible while preventing editor selection on clicks.
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 132;
  }
};
function reviewExtension(host) {
  const reveal = import_state.StateEffect.define();
  const previewEffect = import_state.StateEffect.define();
  const samePreview = (a, b) => a === b || !!a && !!b && a.path === b.path && a.base === b.base && a.original === b.original && a.index === b.index && a.range.from === b.range.from && a.range.to === b.range.to && a.text === b.text;
  const setPreview = (view, preview2) => {
    if (!samePreview(view.state.field(field).preview, preview2)) view.dispatch({ effects: previewEffect.of(preview2) });
  };
  function build(state, previous, requested = null, requestedPreview = null) {
    const path3 = state.field(import_obsidian.editorInfoField, false)?.file?.path, base = path3 ? host.archive.get(path3)?.baseline : void 0;
    const text = state.doc.toString(), enabled = host.settings.highlights;
    const unchanged = previous && previous.text === text && previous.base === base && previous.path === path3 && previous.enabled === enabled;
    const areas = unchanged ? previous.areas : enabled && base !== void 0 && text.length + base.length <= 15e4 ? reviewAreas(base, text) : [];
    const raw = unchanged ? previous.raw : areas.flatMap((area, areaIndex) => changes(area.removed, area.added, true).map((c) => ({ ...c, from: c.from + area.from, to: c.to + area.from, oldFrom: c.oldFrom + area.oldFrom, oldTo: c.oldTo + area.oldFrom, areaIndex })));
    const hovered = unchanged && requested !== null && areas[requested] ? requested : null;
    const preview2 = unchanged && hovered !== null && requestedPreview?.index === hovered && requestedPreview.path === path3 && requestedPreview.original === text && requestedPreview.base === base && requestedPreview.range.from >= 0 && requestedPreview.range.to <= text.length && requestedPreview.range.to >= requestedPreview.range.from ? requestedPreview : null;
    if (unchanged && previous.hovered === hovered && samePreview(previous.preview, preview2)) return previous;
    const ranges = [];
    if (path3 && base !== void 0 && areas.length) {
      for (const c of raw) {
        const areaIndex = c.areaIndex;
        if (preview2 && areaIndex === preview2.index) continue;
        if (c.removed) ranges.push(import_view.Decoration.widget({ widget: new DeletedText(c.removed, areaIndex), side: -1 }).range(c.from));
        if (c.to > c.from) ranges.push(import_view.Decoration.mark({ class: "tc-addition", attributes: { "data-tc-area": String(areaIndex) } }).range(c.from, c.to));
      }
      if (preview2) {
        const { from, to } = preview2.range;
        const widget = new HistoricalText(preview2.text, preview2.original.slice(from, to), preview2.index);
        if (from < to) ranges.push(import_view.Decoration.replace({ widget, inclusive: false }).range(from, to));
        else ranges.push(import_view.Decoration.widget({ widget, side: -1 }).range(from));
      }
      if (hovered !== null) {
        const area = areas[hovered], anchor = area.from < area.to ? areaRange(text, area).to : area.anchor;
        ranges.push(import_view.Decoration.widget({ widget: new ReviewBox(host, path3, base, text, area, hovered, areas.length, setPreview), block: true, side: 1 }).range(state.doc.lineAt(anchor).to));
      }
    }
    return { decorations: import_view.Decoration.set(ranges, true), text, base, path: path3, enabled, hovered, areas, raw, preview: preview2 };
  }
  const field = import_state.StateField.define({ create: (state) => build(state), update: (value, tr) => {
    let hovered = value.hovered, preview2 = value.preview;
    for (const effect of tr.effects) {
      if (effect.is(reveal)) hovered = effect.value;
      if (effect.is(previewEffect)) preview2 = effect.value;
    }
    return build(tr.state, value, hovered, preview2);
  }, provide: (f) => import_view.EditorView.decorations.from(f, (value) => value.decorations) });
  const capture = import_view.ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      view.dom.addEventListener("pointerover", this.enter);
      view.dom.addEventListener("pointermove", this.enter);
      view.dom.addEventListener("pointerout", this.leave);
      view.dom.addEventListener("pointerleave", this.exit);
      view.dom.addEventListener("keydown", this.keydown, true);
      view.dom.addEventListener("beforeinput", this.edit, true);
      view.dom.addEventListener("paste", this.edit, true);
      view.dom.addEventListener("cut", this.edit, true);
      view.dom.addEventListener("drop", this.edit, true);
    }
    hideTimer;
    index(target) {
      const element = target?.closest?.("[data-tc-area]");
      if (!element || !this.view.dom.contains(element)) return null;
      const index = Number(element.dataset.tcArea);
      return Number.isInteger(index) ? index : null;
    }
    show(index) {
      if (this.view.state.field(field).hovered !== index) this.view.dispatch({ effects: reveal.of(index) });
    }
    cancel() {
      clearTimeout(this.hideTimer);
      this.hideTimer = void 0;
    }
    hide() {
      if (this.hideTimer !== void 0 || this.view.state.field(field).hovered === null) return;
      this.hideTimer = setTimeout(() => {
        this.hideTimer = void 0;
        this.show(null);
      }, 250);
    }
    enter = (event) => {
      const index = this.index(event.target);
      if (index !== null) {
        this.cancel();
        this.show(index);
      } else this.hide();
    };
    leave = (event) => {
      const current = this.view.state.field(field).hovered;
      if (current === null) return;
      if (this.index(event.relatedTarget) === current) {
        this.cancel();
        return;
      }
      if (this.index(event.target) === current) this.hide();
    };
    exit = () => this.hide();
    keydown = (event) => {
      const state = this.view.state.field(field);
      if (event.key === "Escape" && state.hovered !== null) {
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        this.show(null);
        return;
      }
      if (state.preview && (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey || ["Backspace", "Delete", "Enter", "Tab"].includes(event.key)) && !event.target?.closest?.("button")) this.edit(event);
    };
    edit = (event) => {
      if (this.view.state.field(field).preview) {
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        this.show(null);
      }
    };
    destroy() {
      this.cancel();
      this.view.dom.removeEventListener("pointerover", this.enter);
      this.view.dom.removeEventListener("pointermove", this.enter);
      this.view.dom.removeEventListener("pointerout", this.leave);
      this.view.dom.removeEventListener("pointerleave", this.exit);
      this.view.dom.removeEventListener("keydown", this.keydown, true);
      this.view.dom.removeEventListener("beforeinput", this.edit, true);
      this.view.dom.removeEventListener("paste", this.edit, true);
      this.view.dom.removeEventListener("cut", this.edit, true);
      this.view.dom.removeEventListener("drop", this.edit, true);
    }
    update(update) {
      const file = update.state.field(import_obsidian.editorInfoField, false)?.file;
      if (update.docChanged && file) {
        if (!host.archive.get(file.path)) void host.capture(file.path, update.startState.doc.toString()).catch(() => {
        });
        host.schedule(file.path, update.state.doc.toString());
      }
    }
  });
  return [field, capture];
}

// src/main.ts
var VIEW = "track-changes-review";
var handoffKey = Symbol.for("obsidian-track-changes.archive-handoffs");
var handoffs = globalThis[handoffKey] ??= /* @__PURE__ */ new Map();
var TrackChanges = class extends import_obsidian2.Plugin {
  settings = { archiveDirectory: import_node_path2.default.join(import_node_os.default.homedir(), "Obsidian Track Changes History"), highlights: true, saveDelayMs: 800 };
  archive;
  ready = false;
  pending = /* @__PURE__ */ new Map();
  lastError = "";
  lastNotice = 0;
  stopped = false;
  startupTimer;
  startup;
  async onload() {
    this.settings = { ...this.settings, ...await this.loadData() };
    this.settings.saveDelayMs = Math.max(200, Math.min(5e3, Number(this.settings.saveDelayMs) || 800));
    if (!(this.app.vault.adapter instanceof import_obsidian2.FileSystemAdapter)) throw Error("Track Changes requires a desktop filesystem vault.");
    const vaultPath = this.app.vault.adapter.getBasePath();
    this.archive = new Archive(import_node_path2.default.join(this.settings.archiveDirectory, Archive.vaultId(vaultPath)));
    this.registerView(VIEW, (leaf) => new ReviewView(leaf, this));
    this.addSettingTab(new TrackSettings(this.app, this));
    this.addRibbonIcon("history", "Track Changes: review edits and history", () => void this.openReview());
    this.addCommand({ id: "review", name: "Review tracked changes and history", callback: () => void this.openReview() });
    this.addCommand({ id: "checkpoint", name: "Save a named checkpoint", editorCallback: (editor, view) => {
      if (view.file) new NameModal(this.app, "Name this checkpoint", (label) => this.capture(view.file.path, editor.getValue(), "checkpoint", { label })).open();
    } });
    this.addCommand({ id: "toggle-highlights", name: "Toggle inline change highlights", callback: () => {
      this.settings.highlights = !this.settings.highlights;
      void this.saveData(this.settings);
      this.refreshEditors();
      new import_obsidian2.Notice(`Track Changes highlights ${this.settings.highlights ? "on" : "off"}`);
    } });
    const status = this.addStatusBarItem();
    status.setText("Track Changes: loading");
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.startupTimer = window.setTimeout(() => {
        this.startupTimer = void 0;
        this.startup = this.startTracking(status).catch((error) => {
          this.ready = false;
          this.report(error);
          status.setText("Track Changes: startup error");
        });
      }, 0);
    });
  }
  async startTracking(status) {
    try {
      await handoffs.get(this.archive.root);
      handoffs.delete(this.archive.root);
      await this.archive.init();
      if (this.stopped) return;
      this.ready = true;
    } catch (error) {
      this.report(error);
      status.setText("Track Changes: archive error");
      return;
    }
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof import_obsidian2.TFile && file.extension === "md") void this.captureDisk(file);
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof import_obsidian2.TFile && file.extension === "md") void this.captureDisk(file);
    }));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file?.extension === "md") void this.captureDisk(file);
      this.refreshViews();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof import_obsidian2.TFile) {
        if (file.extension === "md") void this.rename(file, oldPath);
      } else for (const r of [...this.archive.docs.values()]) if (!r.deleted && r.path.startsWith(`${oldPath}/`)) void this.renamePath(r.path, `${file.path}${r.path.slice(oldPath.length)}`);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      for (const r of [...this.archive.docs.values()]) if (!r.deleted && (r.path === file.path || r.path.startsWith(`${file.path}/`))) void this.markDeleted(r.path);
    }));
    this.registerEditorExtension(this.extension());
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      if (info.file) this.schedule(info.file.path, editor.getValue());
    }));
    this.registerInterval(window.setInterval(() => {
      void this.flushDue();
      status.setText(this.lastError ? "Track Changes: storage error" : `Track Changes: ${this.pending.size ? "saving\u2026" : "tracking"}`);
      status.setAttribute("aria-label", this.lastError || "Local history enabled; no automatic expiry");
    }, 300));
    this.registerDomEvent(window, "blur", () => void this.flushAll());
    void this.seed().catch((e) => this.report(e));
    this.refreshEditors();
    this.refreshViews();
  }
  report(error) {
    console.error("Track Changes", error);
    this.lastError = String(error);
    if (Date.now() - this.lastNotice > 1e4) {
      new import_obsidian2.Notice(`Track Changes could not save history: ${String(error)}. Existing history was preserved.`, 12e3);
      this.lastNotice = Date.now();
    }
  }
  async capture(notePath, content, kind = "edit", options = {}) {
    if (!this.ready) throw Error("History archive is not ready");
    try {
      const prior = this.archive.get(notePath)?.baseline;
      const r = await this.archive.save(notePath, content, kind, options);
      this.lastError = "";
      if (prior !== r.baseline) this.refreshEditors();
      this.refreshViews();
      return r;
    } catch (e) {
      this.report(e);
      throw e;
    }
  }
  async captureDisk(file) {
    try {
      const notePath = file.path, content = await this.app.vault.read(file);
      if (this.stopped || file.path !== notePath) return;
      const editor = this.editorFor(notePath);
      const live = editor?.getValue();
      if (live !== void 0 && live !== content) {
        this.schedule(notePath, live);
        return;
      }
      await this.capture(notePath, content);
    } catch (e) {
      this.report(e);
    }
  }
  schedule(notePath, content) {
    if (!this.ready) return;
    const old = this.pending.get(notePath);
    this.pending.set(notePath, { content, first: old?.first ?? Date.now(), last: Date.now() });
  }
  async flushPath(notePath) {
    const item = this.pending.get(notePath);
    if (!item) return;
    this.pending.delete(notePath);
    try {
      await this.capture(notePath, item.content);
    } catch {
      if (!this.pending.has(notePath)) this.pending.set(notePath, item);
    }
  }
  async flushDue() {
    const now = Date.now();
    for (const [p, item] of this.pending) if (now - item.last >= this.settings.saveDelayMs || now - item.first >= 5e3) await this.flushPath(p);
  }
  async flushAll() {
    for (const p of [...this.pending.keys()]) await this.flushPath(p);
    await this.archive.idle();
  }
  async seed() {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.stopped) return;
      if (!this.archive.get(file.path)) await this.captureDisk(file);
      else {
        const content = await this.app.vault.read(file);
        if (this.stopped) return;
        if (content !== this.archive.get(file.path)?.content) await this.captureDisk(file);
      }
    }
    for (const r of [...this.archive.docs.values()]) {
      if (this.stopped) return;
      if (!r.deleted && !this.app.vault.getAbstractFileByPath(r.path)) await this.markDeleted(r.path);
    }
    this.refreshEditors();
  }
  async renamePath(oldPath, newPath) {
    try {
      await this.flushPath(oldPath);
      const old = this.archive.get(oldPath);
      if (old) await this.capture(newPath, old.content, "rename", { docId: old.docId, oldPath });
    } catch (e) {
      this.report(e);
    }
  }
  async rename(file, oldPath) {
    await this.renamePath(oldPath, file.path);
    await this.captureDisk(file);
  }
  async markDeleted(notePath) {
    try {
      await this.flushPath(notePath);
      const old = this.archive.get(notePath);
      if (old) await this.capture(notePath, old.content, "delete", { docId: old.docId, deleted: true });
    } catch (e) {
      this.report(e);
    }
  }
  editorFor(notePath) {
    return this.app.workspace.getLeavesOfType("markdown").map((l) => l.view).find((v) => v.file?.path === notePath)?.editor;
  }
  current(notePath) {
    return this.editorFor(notePath)?.getValue() ?? this.pending.get(notePath)?.content ?? this.archive.get(notePath)?.content ?? "";
  }
  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) {
      const view = leaf.view;
      if (typeof view.requestRefresh === "function") view.requestRefresh();
    }
  }
  refreshEditors() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const editor = leaf.view.editor;
      editor?.cm?.dispatch({});
    }
  }
  async openReview() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  // Allows the isolated integration harness to use Obsidian's own CM state field.
  get editorContextField() {
    return import_obsidian2.editorInfoField;
  }
  extension() {
    return reviewExtension(this);
  }
  async applyChange(notePath, expected, base, change, accept) {
    if (this.current(notePath) !== expected || this.archive.get(notePath)?.baseline !== base) throw Error("The note changed while reviewing. Refresh and try again.");
    await this.flushPath(notePath);
    if (this.current(notePath) !== expected || this.archive.get(notePath)?.baseline !== base) throw Error("The note changed while saving. Refresh and try again.");
    if (accept) {
      await this.capture(notePath, expected, "accept", { baseline: change ? acceptOne(base, change) : expected });
    } else {
      const next = change ? rejectOne(expected, change) : base;
      await this.replaceSafely(notePath, expected, next, "reject");
    }
    this.refreshEditors();
    this.refreshViews();
  }
  async replaceSafely(notePath, expected, next, kind) {
    await this.capture(notePath, expected, `before-${kind}`);
    const editor = this.editorFor(notePath);
    if (editor) {
      if (editor.getValue() !== expected) throw Error("The note changed. Nothing was replaced.");
      editor.setValue(next);
    } else {
      const file = this.app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof import_obsidian2.TFile)) throw Error("Note no longer exists. Use Recover as copy.");
      await this.app.vault.process(file, (current) => {
        if (current !== expected) throw Error("The note changed. Nothing was replaced.");
        return next;
      });
    }
    this.pending.delete(notePath);
    await this.capture(notePath, next, kind);
  }
  async restoreAreaVersion(notePath, expected, base, range, text) {
    if (this.current(notePath) !== expected || this.archive.get(notePath)?.baseline !== base) throw Error("The note changed while browsing revisions. Open its updated review box.");
    if (range.from < 0 || range.to < range.from || range.to > expected.length) throw Error("Invalid area boundary.");
    const next = expected.slice(0, range.from) + text + expected.slice(range.to);
    await this.replaceSafely(notePath, expected, next, "restore-area");
    this.refreshEditors();
    this.refreshViews();
  }
  async recoverCopy(revision) {
    const basename = revision.path.split("/").pop()?.replace(/\.md$/i, "") || "Recovered note";
    const name = `${basename} (recovered ${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}).md`;
    const file = await this.app.vault.create(name, revision.content);
    await this.capture(file.path, revision.content, "recovered-copy");
    await this.app.workspace.getLeaf(false).openFile(file);
    new import_obsidian2.Notice("Recovered as a new note. Original note preserved.");
  }
  onunload() {
    this.stopped = true;
    window.clearTimeout(this.startupTimer);
    if (this.archive) {
      const finished = (this.startup ?? Promise.resolve()).then(() => this.flushAll()).catch((e) => this.report(e));
      handoffs.set(this.archive.root, finished);
    }
  }
};
function button(parent, text, action, primary = false) {
  const b = parent.createEl("button", { text, cls: primary ? "mod-cta" : "" });
  b.addEventListener("click", () => {
    b.disabled = true;
    Promise.resolve().then(action).catch((e) => new import_obsidian2.Notice(String(e), 9e3)).finally(() => b.disabled = false);
  });
  return b;
}
function showDiff(parent, before, after) {
  const el = parent.createDiv({ cls: "tc-diff" });
  const parts = before.length + after.length > 4e5 ? void 0 : diffWordsWithSpace(before, after, { timeout: 200 });
  if (!parts) {
    el.createEl("p", { text: "Large revision: complete text shown below. Recover as copy to compare in an editor." });
    el.createEl("pre", { text: after });
    return;
  }
  for (const part of parts) el.createEl(part.added ? "ins" : part.removed ? "del" : "span", { text: part.value });
}
var ReviewView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  timer;
  disposed = false;
  selectedDoc;
  allNotes = false;
  query = "";
  page = 0;
  generation = 0;
  selectedRevision;
  selectionName;
  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return "Track Changes";
  }
  getIcon() {
    return "history";
  }
  async onOpen() {
    this.disposed = false;
    await this.render();
  }
  async onClose() {
    this.disposed = true;
    window.clearTimeout(this.timer);
    this.generation++;
  }
  requestRefresh() {
    if (this.timer || this.disposed) return;
    this.timer = window.setTimeout(() => {
      this.timer = void 0;
      void this.render();
    }, 900);
  }
  async render() {
    if (this.disposed) return;
    const gen = ++this.generation, p = this.plugin, root = this.contentEl;
    root.empty();
    root.addClass("tc-review");
    root.createEl("h2", { text: "Track Changes" });
    if (!p.ready) {
      root.createEl("p", { text: "The history archive is not ready. Check plugin settings or storage permissions." });
      return;
    }
    root.createEl("p", { text: p.lastError ? `Storage error: ${p.lastError}` : "Local history \xB7 no automatic expiry", cls: p.lastError ? "tc-error" : "tc-caption" });
    const tools = root.createDiv({ cls: "tc-tools" });
    button(tools, this.allNotes ? "Current note" : "Browse all notes", () => {
      this.allNotes = !this.allNotes;
      this.page = 0;
      this.selectedRevision = void 0;
      void this.render();
    });
    button(tools, "Refresh", async () => {
      await p.flushAll();
      await this.render();
    });
    if (this.allNotes) {
      const input = root.createEl("input", { type: "search", placeholder: "Find a note, including deleted notes\u2026", value: this.query });
      input.addEventListener("input", () => {
        this.query = input.value;
        this.renderNoteList(list);
      });
      const list = root.createDiv({ cls: "tc-note-list" });
      this.renderNoteList(list);
    } else this.selectedDoc = p.archive.get(p.app.workspace.getActiveFile()?.path ?? "")?.docId;
    const doc = this.selectedDoc ? p.archive.docs.get(this.selectedDoc) : void 0;
    if (!doc) {
      root.createEl("p", { text: "Open a Markdown note, or browse all notes to recover a deleted document." });
      return;
    }
    root.createEl("h3", { text: doc.path + (doc.deleted ? " (deleted)" : "") });
    if (!doc.deleted) {
      const current = p.current(doc.path), base = doc.baseline, edits = reviewAreas(base, current);
      root.createEl("p", { text: `${edits.length} pending change${edits.length === 1 ? "" : "s"} since the last accepted version.` });
      const actions = root.createDiv({ cls: "tc-tools" });
      button(actions, "Accept all", async () => {
        await p.applyChange(doc.path, current, base, void 0, true);
        await this.render();
      }, true);
      button(actions, "Reject all", () => new ConfirmModal(p.app, "Reject all pending changes?", "The current text will be saved to history before restoring the accepted version.", async () => {
        await p.applyChange(doc.path, current, base, void 0, false);
        await this.render();
      }).open());
      button(actions, "Checkpoint", () => new NameModal(p.app, "Name this checkpoint", (label) => p.capture(doc.path, p.current(doc.path), "checkpoint", { label })).open());
      for (const [i, c] of edits.slice(0, 100).entries()) {
        const card = root.createDiv({ cls: "tc-change" });
        card.createEl("strong", { text: `Change ${i + 1}` });
        if (c.removed) card.createEl("del", { text: c.removed });
        if (c.added) card.createEl("ins", { text: c.added });
        const row = card.createDiv({ cls: "tc-tools" });
        button(row, "Accept", async () => {
          await p.applyChange(doc.path, current, base, c, true);
          await this.render();
        });
        button(row, "Reject", async () => {
          await p.applyChange(doc.path, current, base, c, false);
          await this.render();
        });
      }
      if (edits.length > 100) root.createEl("p", { text: "Showing the first 100 changes. Review these to reveal the remaining changes, or use Accept all / Reject all." });
    }
    root.createEl("h3", { text: "Revision history" });
    const names = await p.archive.list(doc.docId);
    if (gen !== this.generation || this.disposed) return;
    this.page = Math.min(this.page, Math.max(0, Math.ceil(names.length / 30) - 1));
    root.createEl("p", { text: `${names.length} saved revisions \xB7 page ${this.page + 1} of ${Math.max(1, Math.ceil(names.length / 30))}`, cls: "tc-caption" });
    const nav = root.createDiv({ cls: "tc-tools" });
    button(nav, "Newer", () => {
      this.page = Math.max(0, this.page - 1);
      void this.render();
    }).disabled = this.page === 0;
    button(nav, "Older", () => {
      this.page++;
      void this.render();
    }).disabled = (this.page + 1) * 30 >= names.length;
    const history = root.createDiv({ cls: "tc-history" }), preview2 = root.createDiv();
    const entries = await Promise.all(names.slice(this.page * 30, this.page * 30 + 30).map(async (name) => ({ name, r: await p.archive.load(doc.docId, name) })));
    if (gen !== this.generation || this.disposed) return;
    for (const { name, r } of entries) {
      button(history, `${new Date(r.time).toLocaleString()} \xB7 ${r.label || r.kind}`, async () => {
        this.selectedRevision = r;
        this.selectionName = name;
        await this.preview(preview2, r, name, names);
      });
    }
    if (this.selectedRevision?.docId === doc.docId && this.selectionName) await this.preview(preview2, this.selectedRevision, this.selectionName, names);
  }
  renderNoteList(list) {
    list.empty();
    const docs = [...this.plugin.archive.docs.values()].filter((r) => r.path.toLowerCase().includes(this.query.toLowerCase())).sort((a, b) => a.path.localeCompare(b.path));
    for (const r of docs.slice(0, 100)) button(list, r.path + (r.deleted ? " \xB7 deleted" : ""), () => {
      this.selectedDoc = r.docId;
      this.selectedRevision = void 0;
      this.page = 0;
      void this.render();
    });
    if (docs.length > 100) list.createEl("p", { text: "Refine your search to see more notes." });
  }
  async preview(root, r, name, names) {
    const p = this.plugin;
    root.empty();
    root.createEl("h3", { text: r.label || `${r.kind} \xB7 ${new Date(r.time).toLocaleString()}` });
    const actions = root.createDiv({ cls: "tc-tools" });
    button(actions, "Recover as copy", () => p.recoverCopy(r), true);
    const latest = p.archive.docs.get(r.docId);
    if (latest && !latest.deleted) button(actions, "Restore this version", () => {
      const expected = p.current(latest.path);
      new ConfirmModal(p.app, "Restore this revision?", `The current version of ${latest.path} will be saved first. You can also recover a separate copy.`, async () => {
        await p.replaceSafely(latest.path, expected, r.content, "restore");
        p.refreshEditors();
        await this.render();
      }).open();
    });
    const index = names.indexOf(name), previous = names[index + 1] ? await p.archive.load(r.docId, names[index + 1]) : void 0;
    if (this.selectionName !== name) return;
    root.createEl("p", { text: previous ? "Changes from the preceding saved revision:" : "First saved version:", cls: "tc-caption" });
    showDiff(root, previous?.content ?? "", r.content);
  }
};
var NameModal = class extends import_obsidian2.Modal {
  constructor(app, title, done) {
    super(app);
    this.title = title;
    this.done = done;
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    const input = this.contentEl.createEl("input", { type: "text", placeholder: "Before rewriting the introduction" });
    input.focus();
    button(this.contentEl, "Save checkpoint", async () => {
      await this.done(input.value.trim() || "Checkpoint");
      this.close();
      new import_obsidian2.Notice("Checkpoint saved");
    }, true);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian2.Modal {
  constructor(app, title, description, done) {
    super(app);
    this.title = title;
    this.description = description;
    this.done = done;
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.description });
    const row = this.contentEl.createDiv({ cls: "tc-tools" });
    button(row, "Cancel", () => this.close());
    button(row, "Confirm", async () => {
      await this.done();
      this.close();
    }, true);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TrackSettings = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const root = this.containerEl, p = this.plugin;
    root.empty();
    root.createEl("h2", { text: "Track Changes" });
    root.createEl("p", { text: "History has no age, revision-count, or size limit. It grows until storage is full. Back up this archive separately; history is not an off-device backup. Only Markdown notes are tracked, beginning when this plugin is enabled. Changes made while Obsidian is closed can only be recorded as the next observed version." });
    new import_obsidian2.Setting(root).setName("Inline highlights and review boxes").setDesc("Show word highlights, Accept / Reject controls, and Previous / Next revisions of the hovered area.").addToggle((t) => t.setValue(p.settings.highlights).onChange(async (value) => {
      p.settings.highlights = value;
      await p.saveData(p.settings);
      p.refreshEditors();
    }));
    let directory = p.settings.archiveDirectory;
    new import_obsidian2.Setting(root).setName("Archive directory").setDesc("Absolute folder outside the vault. A separate subfolder is used for each vault. Changing it requires a plugin reload; move the existing vault history folder yourself to keep continuity.").addText((t) => t.setValue(directory).onChange((value) => {
      directory = value.trim();
    })).addButton((b) => b.setButtonText("Save for next reload").onClick(async () => {
      if (!import_node_path2.default.isAbsolute(directory)) {
        new import_obsidian2.Notice("Choose an absolute folder path.");
        return;
      }
      p.settings.archiveDirectory = directory;
      await p.saveData(p.settings);
      new import_obsidian2.Notice("Saved. Reload the plugin to use this directory. Existing history has not been moved.");
    }));
    root.createEl("p", { text: `Active archive: ${p.archive?.root ?? "Not initialized"}`, cls: "tc-archive-path" });
    root.createEl("p", { text: "Accepting changes updates the accepted version; it never deletes revisions. Rejecting and restoring save the current text first. Deleted notes remain in Browse all notes. Highlights describe edits since the accepted version, not collaborator suggestions or author attribution." });
  }
};
