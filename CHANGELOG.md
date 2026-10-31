# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-10-31

### ⚠️ Breaking Changes

- **Unsupported values are rejected.** Storing a `Date`, `Map`, `Set`, `RegExp`, `Promise` or any other value that cannot be locked deeply now throws `TypeError: Unsupported value type "[object Date]" at "a"."b"`. Previously these values were stored by reference and remained mutable. Store a plain value instead (e.g. an ISO string or a timestamp).
- **Nested objects throw DX Central errors.** Reassigning or deleting a nested value now throws `Cannot reassign "prop"` / `Can't delete "prop"` (an `Error`) instead of the native `TypeError`. Mutating array methods (`push`, `pop`, `splice`, `sort`...) also throw.
- **`$Central(object)` no longer modifies its argument.** It returns a new immutable copy that merges the object with the registry (the object's own keys win). Passing a function keeps the previous behavior: the function itself is used as the container.
- **Merged functions are no longer merged as objects.** A key that holds a function now conflicts with an object (or vice versa) instead of trying to merge properties into the frozen function.
- **Keys such as `toString`, `valueOf` or `hasOwnProperty` are now stored.** They were silently dropped before. Only `__proto__`, `constructor` and `prototype` are ignored.

### Fixed

- Nested objects and arrays were not actually locked: new keys could be added (`$Settings.api.extra = 1`) and arrays could grow (`list.push(3)`). They are now deeply immutable.
- An object referenced by several keys in the same call was copied only the first time; the other keys got an empty object. Shared references now keep their content (and stay the same object), and circular references are still copied safely.
- A failing call could leave part of its keys applied. Every call is now simulated completely before anything is stored, so it is atomic, including conflicts caused by shared or circular references within the same call.
- Error messages for nested conflicts reported only the parent key (`Cannot reassign "a"` instead of `Cannot reassign "a"."b"."c"`).
- Async functions, generators and other non-plain functions crashed with `Cannot read properties of undefined (reading 'length')`.
- `$Config` / `$Settings` instances nested as values could fail halfway through a call. They are now copied by their data, like top-level sources.
- `$Settings.constructor` (and `$Config(...).constructor`) exposed the `Function` constructor.

### Added

- `Object.keys()`, spread (`{ ...$Settings }`), the `in` operator and `JSON.stringify()` now work on `$Settings` and `$Config` instances. A `toJSON()` method returns a plain top-level snapshot (a `toJSON` key of your own takes precedence).
- `Object.freeze()` / `Object.preventExtensions()` on a managed object throw `Cannot prevent extensions of...`.
- Test suite (`npm test`, Node's built-in test runner).

[3.0.0]: https://github.com/okzgn/dx-central-js/releases/tag/v3.0.0
