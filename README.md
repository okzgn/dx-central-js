# DX Central

**Immutable, Prototype-Safe, and Fail-Fast Configuration Management for JavaScript.**

**DX Central** provides a robust, zero-dependency system to manage application configurations and shared state. It enforces strict immutability, ensuring your configuration objects are effectively **WORM** (*Write-Once, Read-Many*). Say goodbye to unpredictable mutations, prototype pollution, and state spaghetti.

---

## 🚀 Installation

Install the package via NPM:

```bash
npm install dx-central
```

Import it directly into your ESM modules:

```javascript
import { $Settings, $Config, $Register, $Central } from 'dx-central';
```

---

## 💡 Why DX Central?

In complex applications (especially those with plugins, micro-frontends, or heavy dependency injection), global configurations are prone to runtime mutations. DX Central protects your app by providing:

1. **Tamper-Proof State:** Once a value is initialized, it is locked deeply. It cannot be reassigned, deleted, or redefined.
2. **Fail-Fast Philosophy:** Instead of silently ignoring bad mutations, DX Central throws descriptive errors immediately, pointing you exactly to the violation.
3. **Security First:** Explicitly blocks Prototype Pollution attacks (`__proto__`, `constructor`, `prototype` are ignored completely).
4. **Circular-Reference Safe:** Safely parses and merges deeply nested objects without memory leaks or stack overflows.

---

## 📖 API Reference & Patterns

DX Central exposes three distinct patterns depending on your architecture.

### 1. `$Settings` (The Global Singleton)
Best for centralized, application-wide configurations (e.g., environment variables, API endpoints). 

You call `$Settings` as a function to initialize/add properties, and use it as an object to read values.

```javascript
import { $Settings } from 'dx-central';

// 1. Initialize (Can be called multiple times to add NEW keys)
$Settings({
    api: { url: 'https://api.myapp.com', timeout: 5000 },
    debugMode: true
});

// 2. Access values safely anywhere in your app
console.log($Settings.api.url); // 'https://api.myapp.com'

// ❌ 3. Mutations are strictly forbidden
$Settings.debugMode = false;      // THROW: Cannot reassign "debugMode"
$Settings.api.timeout = 10000;    // THROW: TypeError (Read-only property)
delete $Settings.api;             // THROW: Can't delete "api"

// ❌ 4. Modifying existing structures via function throws error too
$Settings({ debugMode: false });  // THROW: Cannot reassign "debugMode"
```

### 2. `$Config` (The Scoped Factory)
Best for creating unique, isolated, and immutable configuration instances (e.g., database connections, localized server instances).

```javascript
import { $Config } from 'dx-central';

const myServerConfig = $Config({ port: 8080, host: 'localhost' });
const myDbConfig = $Config({ port: 5432, user: 'admin' });

// These are entirely independent
console.log(myServerConfig.port); // 8080
console.log(myDbConfig.port);     // 5432

// You can expand them later by calling them as functions:
myServerConfig({ protocol: 'https' });
console.log(myServerConfig.protocol); // 'https'
```

### 3. `$Register` & `$Central` (The Distributed Registry)
**This is the most powerful feature for modular or plugin-based apps.** It allows isolated modules to contribute to a shared state asynchronously. 

⚠️ **Rule of `$Register`:** *First-come, first-served.* If two modules try to register the same key, the first one wins. Subsequent attempts to overwrite existing keys are safely **ignored** (without throwing errors), protecting the core state from rogue plugins.

**Plugin A (Loads first):**
```javascript
import { $Register } from 'dx-central';

// $Register is chainable!
$Register({ theme: { primary: 'blue' } })
         ({ analytics: { enabled: true } });
```

**Plugin B (Attempting to hijack a setting):**
```javascript
import { $Register } from 'dx-central';

$Register({ 
    theme: { primary: 'red' }, // Will be IGNORED (Plugin A got here first)
    featureFlags: { beta: true } // Will be ADDED (It's a new key)
});
```

**Application Core / Bootstrap:**
```javascript
import { $Central } from 'dx-central';

// Aggregates all registered modules into a final, immutable object
const appState = $Central();

console.log(appState.theme.primary); // 'blue' (Protected by Plugin A)
console.log(appState.featureFlags.beta); // true

// You can also merge the global registry into a local object securely:
const localConfig = $Central({ localKey: 123 });
```

---

## 🛑 Error Handling Guide

DX Central stops execution the moment a developer tries to break immutability. 

| Error Message / Behavior | Cause | Developer Fix |
| :--- | :--- | :--- |
| `Cannot reassign "[prop]"` | Tried to update an existing key via assignment or functional call. | Structure your app to initialize config values only once. |
| `TypeError: Cannot assign to read only property...` | Tried to update a deeply nested property (e.g., `$Settings.a.b = 2`). | Nested structures are deeply locked. |
| `Set with [Name]({ "prop": value })` | Tried to add a *brand new* key using `=` assignment. | Use the functional approach: `$Settings({ newKey: 'value' })`. |
| `Can't delete "[prop]"` | Used the `delete` keyword on the config root. | Deletion is forbidden to ensure reliable state. |
| `Cannot change prototype of...` | Attempted to use `Object.setPrototypeOf`. | Action blocked for security. |

---

## 🛠️ Behavior Notes for Developers

* **Deep Immutability:** When you pass an object to DX Central, it recursively traverses it. Every nested object and array becomes deeply read-only.
* **Array Merging & Methods:** Arrays are locked by index. If you register `[1, 2]` and try to register `[3, 4]` at the same key, it will conflict on index `0` and `1`. Because arrays are strictly locked, methods that mutate them in place (`push`, `pop`, `splice`) will throw a native Javascript `TypeError`. If you need derived arrays, use pure methods like `.map()` or `.filter()`.
* **Function Merging:** When you register a function into DX Central, the original function reference is shallow-frozen using `Object.freeze()`. This ensures absolute integrity and prevents backdoor mutations via external references.
* **Prototype Nullification:** The structures managed by DX Central (like `$Settings`) inherit from `Object.create(null)`. They do **not** have methods like `.hasOwnProperty()` or `.toString()`. This is by design, ensuring no accidental key collisions with native Object methods.

---

## 📝 License

MIT License.

Copyright © 2026 [OKZGN](https://okzgn.com)