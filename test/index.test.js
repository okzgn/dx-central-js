import { test } from 'node:test';
import assert from 'node:assert/strict';
import { $Settings, $Config, $Register, $Central } from '../index.js';

test('nested structures are deeply locked', () => {
    const cfg = $Config({ api: { timeout: 5 }, list: [1, 2] });
    assert.throws(() => { cfg.api.timeout = 9; }, /Cannot reassign "timeout"/);
    assert.throws(() => { cfg.api.extra = 1; }, /Set with Config\(\{ "extra": 1 \}\)/);
    assert.throws(() => { delete cfg.api.timeout; }, /Can't delete "timeout"/);
    assert.throws(() => { cfg.list.push(3); }, /Set with Config/);
    assert.throws(() => { cfg.list.length = 0; }, /Cannot reassign "length"/);
    assert.throws(() => { Object.freeze(cfg.api); }, /Cannot prevent extensions/);
    assert.deepEqual(cfg.list.map((n) => n * 2), [2, 4]);
    assert.equal(cfg.api.timeout, 5);
    assert.equal(cfg.list.length, 2);
});

test('nested objects can still be extended through the function call', () => {
    const cfg = $Config({ api: { url: 'x' } });
    cfg({ api: { timeout: 1 }, list: [1] })({ other: [1, 2] });
    assert.equal(cfg.api.url, 'x');
    assert.equal(cfg.api.timeout, 1);
    assert.equal(cfg.other[1], 2);
    assert.throws(() => cfg({ list: [9] }), /Cannot reassign "list"."0"/);
});

test('values that cannot be locked deeply are rejected', () => {
    for(const value of [new Date(0), new Map(), new Set(), /x/, Promise.resolve()]){
        assert.throws(() => $Config({ nested: { value } }), (e) => e instanceof TypeError && /Unsupported value type .* at "nested"."value"/.test(e.message));
    }
});

test('shared (non-circular) references keep their content', () => {
    const shared = { a: 1 };
    const cfg = $Config({ x: shared, y: shared });
    assert.equal(cfg.x.a, 1);
    assert.equal(cfg.y.a, 1);
    assert.equal(cfg.x, cfg.y);
});

test('circular references are copied without overflowing', () => {
    const source = { name: 'root', child: { name: 'child' } };
    source.child.parent = source;
    source.self = source;
    const cfg = $Config({ source });
    assert.equal(cfg.source.child.name, 'child');
    assert.equal(cfg.source.child.parent.name, 'root');
    assert.equal(cfg.source.self.self, cfg.source.self);
});

test('keys that collide with Object.prototype are kept', () => {
    const cfg = $Config({ toString: 'a', valueOf: 1, hasOwnProperty: true });
    assert.equal(cfg.toString, 'a');
    assert.equal(cfg.valueOf, 1);
    assert.equal(cfg.hasOwnProperty, true);
});

test('prototype pollution keys are ignored', () => {
    const cfg = $Config(JSON.parse('{"__proto__":{"pwn":1},"constructor":{"x":1},"ok":1}'));
    assert.equal(({}).pwn, undefined);
    assert.equal(cfg.constructor, undefined);
    assert.equal(cfg.ok, 1);
});

test('configuration is enumerable and serializable', () => {
    const cfg = $Config({ a: 1, nested: { b: [1, 2] } });
    assert.deepEqual(Object.keys(cfg), ['a', 'nested']);
    assert.equal(JSON.stringify(cfg), '{"a":1,"nested":{"b":[1,2]}}');
    assert.equal(JSON.stringify({ ...cfg }), '{"a":1,"nested":{"b":[1,2]}}');
    assert.equal('a' in cfg, true);
    assert.equal('zzz' in cfg, false);
    assert.equal(cfg.toJSON().a, 1);
    assert.throws(() => { cfg.toJSON().nested.c = 1; }, /Set with/);
});

test('a failed merge changes nothing', () => {
    const cfg = $Config({ keep: 1, tree: { a: 1 } });
    assert.throws(() => cfg({ fresh: 1, tree: { b: 2, a: 3 }, keep: 2 }), /Cannot reassign "tree"."a"/);
    assert.equal(cfg.fresh, undefined);
    assert.equal(cfg.tree.b, undefined);
    assert.throws(() => cfg({ other: 1, bad: { when: new Date() } }), TypeError);
    assert.equal(cfg.other, undefined);
});

test('nested $Config / $Settings handles are copied by their data', () => {
    const inner = $Config({ a: 1, deep: { b: 2 } });
    const outer = $Config({ keep: 1 });
    outer({ sub: inner });
    assert.equal(outer.sub.a, 1);
    assert.equal(outer.sub.deep.b, 2);
    assert.equal(typeof outer.sub, 'object');
    inner({ later: 1 });
    assert.equal(outer.sub.later, undefined);
    assert.throws(() => outer({ fresh: 1, other: $Config({ bad: 1 }), keep: 2 }), /Cannot reassign "keep"/);
    assert.equal(outer.fresh, undefined);
});

test('a merge that conflicts with itself through aliased containers changes nothing', () => {
    const shared = {};
    const aliased = $Config({ x: shared, y: shared });
    assert.throws(() => aliased({ x: { k: 1 }, y: { k: 2 } }), /Cannot reassign "y"."k"/);
    assert.equal(aliased.x.k, undefined);
    aliased({ x: { k: 1 } });
    assert.equal(aliased.y.k, 1);

    const node = { name: 'n' };
    node.self = node;
    const cyclic = $Config({ node });
    assert.throws(() => cyclic({ node: { k: 1, self: { k: 2 } } }), /Cannot reassign "node"."self"."k"/);
    assert.equal(cyclic.node.k, undefined);
});

test('reassign errors report the full path', () => {
    const cfg = $Config({ a: { b: { c: 1 } } });
    assert.throws(() => cfg({ a: { b: { c: 2 } } }), /Cannot reassign "a"."b"."c"/);
    assert.throws(() => cfg({ a: 1 }), /Cannot reassign "a"/);
});

test('functions of any kind are accepted and frozen', () => {
    const fn = async () => 1;
    const cfg = $Config({ fn, gen: function*(){} });
    assert.equal(cfg.fn, fn);
    assert.equal(Object.isFrozen(fn), true);
    assert.equal(typeof cfg.gen, 'function');
});

test('$Settings is a singleton that only accepts new keys', () => {
    $Settings({ singletonA: { v: 1 } });
    $Settings({ singletonB: true });
    assert.equal($Settings.singletonA.v, 1);
    assert.throws(() => { $Settings.singletonB = false; }, /Cannot reassign "singletonB"/);
    assert.throws(() => $Settings({ singletonB: false }), /Cannot reassign "singletonB"/);
    assert.throws(() => { $Settings.brandNew = 1; }, /Set with Settings\(\{ "brandNew": 1 \}\)/);
    assert.throws(() => { delete $Settings.singletonA; }, /Can't delete "singletonA"/);
    assert.throws(() => Object.setPrototypeOf($Settings, {}), /Cannot change prototype/);
});

test('$Register is first-come-first-served and deep merges new keys', () => {
    $Register({ theme: { primary: 'blue' } })({ analytics: { enabled: true } });
    $Register({ theme: { primary: 'red', secondary: 'green' }, featureFlags: { beta: true } });
    const app = $Central();
    assert.equal(app.theme.primary, 'blue');
    assert.equal(app.theme.secondary, 'green');
    assert.equal(app.featureFlags.beta, true);
    assert.throws(() => { app.theme.primary = 'x'; }, /Cannot reassign "primary"/);
    assert.throws(() => { app.theme.other = 'x'; }, /Set with/);
});

test('$Register rejects unsupported values before changing anything', () => {
    assert.throws(() => $Register({ atomicRegister: 1, bad: new Map() }), TypeError);
    assert.equal($Central().atomicRegister, undefined);
});

test('$Central() is a live view of the registry', () => {
    const app = $Central();
    $Register({ lateModule: 1 });
    assert.equal(app.lateModule, 1);
});

test('$Central(object) returns a merged copy and leaves the object alone', () => {
    $Register({ sharedTheme: { primary: 'blue' } });
    const local = { localKey: 123, sharedTheme: { primary: 'local' } };
    const merged = $Central(local);
    assert.equal(merged.localKey, 123);
    assert.equal(merged.sharedTheme.primary, 'local');
    assert.equal(merged.theme.primary, 'blue');
    assert.equal(Object.keys(local).join(), 'localKey,sharedTheme');
    assert.equal(Object.getOwnPropertyDescriptor(local, 'localKey').writable, true);
    local.localKey = 1;
    assert.throws(() => { merged.localKey = 1; }, /Cannot reassign "localKey"/);
    assert.throws(() => { merged.fresh = 1; }, /Set with Register\(\{ "fresh": 1 \}\) and Central\(\[object Object\]\)/);
});
