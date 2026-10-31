const Central = Object.create(null);
const Containers = new WeakMap();
const Raws = new WeakMap();
const Reserved = {
    'object': new Set(['__proto__', 'prototype', 'constructor']),
    'array': new Set(['length']),
    'function': new Set()
};

export const $Config = createImmutable('Config', function(){ return Object.create(null); });
export const $Settings = createImmutable('Settings', Object.create(null));
const registry = createImmutableInterceptors('Central', Central);
export const $Register = function(object){
    deepMergeNoOverwrite(registry, Central, object, true, false);
    return $Register;
};

export const $Central = function(object){
    const isCentral = !isCorrectObject(object);
    let target = Central;
    if(!isCentral){
        target = isFn(object) ? object : (Array.isArray(object) ? [] : Object.create(null));
    }

    let interceptors = createImmutableInterceptors({
        name: 'Register',
        setContainer: function(message){
            return message + ' and Central(' + (!isCentral ? getType(object) : '') + ')';
        }
    }, target);

    if(!isCentral){
        if(!isFn(object)){ deepMergeNoOverwrite(interceptors, target, object, true, false); }
        deepMergeNoOverwrite(interceptors, target, Central, true, false);
    }

    return new Proxy(target, interceptors.handlers);
}

function createImmutable(name, dataContainer){
    if(isFn(dataContainer)){
        return function(){
            return createImmutable(name, dataContainer()).apply(this, arguments);
        };
    }

    let interceptors = createImmutableInterceptors(name, dataContainer);
    let target = new Proxy(
        createImmutableFunction(name, function(object){
            deepMergeNoOverwrite(interceptors, dataContainer, object, false, false);
            return target;
        }),
        interceptors.handlers
    );
    Containers.set(target, dataContainer);
    return target;
}

function createImmutableInterceptors(name, dataContainer){
    const options = name;
    const msgFn = function(message){ return message; };

    const messages = {
        defineProperty: msgFn,
        setPrototypeOf: msgFn,
        setContainer: msgFn,
        set: msgFn,
        deleteProperty: msgFn
    };

    if(isObject(name)){
        if(isFn(name.defineProperty)){ messages.defineProperty = name.defineProperty; }
        if(isFn(name.setPrototypeOf)){ messages.setPrototypeOf = name.setPrototypeOf; }
        if(isFn(name.setContainer)){ messages.setContainer = name.setContainer; }
        if(isFn(name.set)){ messages.set = name.set; }
        if(isFn(name.deleteProperty)){ messages.deleteProperty = name.deleteProperty; }
        messages.name = name.name;
        if(messages.name){
            name = messages.name;
        }
    }

    const interceptors = {
        lock: true,
        wrap: function(container){
            let proxy = new Proxy(container, createImmutableInterceptors(options, container).handlers);
            Raws.set(proxy, container);
            return proxy;
        },
        handlers: {
            defineProperty: function(target, prop, descriptor){
                if(interceptors.lock){ throw new Error(messages.defineProperty('Cannot define property "' + String(prop) + '" on ' + name)); }
                return Reflect.defineProperty(target, prop, descriptor);
            },

            setPrototypeOf: function(target, prototype){
                throw new Error(messages.setPrototypeOf('Cannot change prototype of ' + name));
            },

            preventExtensions: function(target){
                throw new Error(messages.defineProperty('Cannot prevent extensions of ' + name));
            },

            set: function(target, prop, value){
                if(!(prop in dataContainer)){
                    const displayValue = isObject(value) ? '{...}' : Array.isArray(value) ? '[...]' : String(value);
                    throw new Error(messages.setContainer('Set with ' + name + '({ "' + String(prop) +'": ' + displayValue + ' })'));
                }
                throw new Error(messages.set('Cannot reassign "' + String(prop) +'"'));
            },

            deleteProperty: function(target, prop){
                throw new Error(messages.deleteProperty('Can\'t delete "' + String(prop) + '"'));
            },

            get: function(target, prop){
                if(prop in dataContainer){ return Reflect.get(dataContainer, prop); }
                if(prop === 'toJSON' && target !== dataContainer){
                    return function(){ return Object.assign(Object.create(null), dataContainer); };
                }
                if(inTarget(target, prop)){ return Reflect.get(target, prop); }
                return undefined;
            },

            has: function(target, prop){
                return (prop in dataContainer) || inTarget(target, prop);
            },

            ownKeys: function(target){
                return Reflect.ownKeys(dataContainer);
            },

            getOwnPropertyDescriptor: function(target, prop){
                let descriptor = Reflect.getOwnPropertyDescriptor(dataContainer, prop);
                // A proxy can only report a non-configurable property when its target has one.
                if(descriptor && target !== dataContainer){ descriptor.configurable = true; }
                return descriptor;
            }
        }
    };
    return interceptors;
}

function createImmutableFunction(name, targetFn){
    // Arrow function: no own non-configurable "prototype", so ownKeys can expose only the data.
    const handler = (object) => targetFn(object);
    Object.defineProperty(handler, 'name', { value: name });
    return handler;
}

// Simulates the whole merge first (dry run, writes go to "pending" instead of the containers),
// so a failed merge never leaves a half-applied state.
function deepMergeNoOverwrite(interceptors, target, source, silent, firstMode){
    for(let dry of [true, false]){
        merge({
            interceptors: interceptors,
            silent: silent,
            dry: dry,
            pending: new WeakMap(),
            created: new WeakMap(),
            merged: new WeakMap()
        }, target, source, firstMode);
    }
    return target;
}

function merge(context, target, source, firstMode, parentKey){
    const sourceIsContainer = isContainer(source);
    const mergeFirstMode = !firstMode ? (sourceIsContainer ? true : isCorrectObject(source)) : isCorrectObject(source);
    if(sourceIsContainer){ source = Containers.get(source); }
    if(!mergeFirstMode || wasMerged(context, source, target)){ return target; }

    for(let key of Reflect.ownKeys(source)){
        if(hasOwnProperty(source, key)){
            if(Reserved[getKind(source)].has(key)){ continue; }

            let sourceValue = resolveContainer(source[key]);
            let path = (parentKey || []).concat([String(key)]);
            if(!hasKey(context, target, key)){
                if(isCorrectObject(sourceValue)){
                    lockKey(context, target, key, createLocked(context, sourceValue, path));
                }
                else if(sourceValue === null || typeof sourceValue !== 'object'){
                    lockKey(context, target, key, sourceValue);
                }
                else {
                    // Date, Map, Set, etc. cannot be locked deeply.
                    throw new TypeError('Unsupported value type "' + getType(sourceValue) + '" at "' + path.join('"."') + '"');
                }
            }
            else if(isMergeable(getKey(context, target, key)) && isMergeable(sourceValue)){
                merge(context, unwrap(getKey(context, target, key)), sourceValue, true, path);
            }
            else if(!context.silent){
                throw new Error('Cannot reassign "' + path.join('"."') + '"');
            }
        }
    }

    return target;
}

function createLocked(context, sourceValue, path){
    // Shared and circular references resolve to the container already created for them.
    let created = context.created.get(sourceValue);
    if(created){ return created; }

    if(getKind(sourceValue) === 'function'){
        return context.dry ? sourceValue : Object.freeze(sourceValue);
    }

    let container = Array.isArray(sourceValue) ? [] : Object.create(null);
    created = context.dry ? container : context.interceptors.wrap(container);
    context.created.set(sourceValue, created);
    merge(context, container, sourceValue, true, path);
    return created;
}

function wasMerged(context, source, target){
    let targets = context.merged.get(source);
    if(!targets){
        targets = new WeakSet();
        context.merged.set(source, targets);
    }
    if(targets.has(target)){ return true; }
    targets.add(target);
    return false;
}

function hasKey(context, target, key){
    let pending = context.pending.get(target);
    return (pending !== undefined && pending.has(key)) || (key in target);
}

function getKey(context, target, key){
    let pending = context.pending.get(target);
    return (pending !== undefined && pending.has(key)) ? pending.get(key) : target[key];
}

function lockKey(context, target, key, value){
    if(!context.dry){ return setLocked(context.interceptors, target, key, value); }
    if(!context.pending.has(target)){ context.pending.set(target, new Map()); }
    context.pending.get(target).set(key, value);
}

function setLocked(interceptors, target, key, value){
    interceptors.lock = false;
    try {
        Object.defineProperty(target, key, {
            value: value,
            writable: false,
            configurable: false,
            enumerable: true
        });
    }
    finally {
        interceptors.lock = true;
    }
}

// Exposes call/apply/bind of the function target, but never its constructor or prototype.
function inTarget(target, prop){
    return !Reserved.object.has(prop) && (prop in target);
}

function unwrap(container){
    return Raws.get(container) || container;
}

function isMergeable(object){
    return isObject(object) || Array.isArray(object);
}

function isCorrectObject(object){
    return isFn(object) || isObject(object) || Array.isArray(object);
}

function isObject(object){
    return getType(object) === '[object Object]';
}

function isFn(fn){
    return typeof fn === 'function';
}

function getKind(target){
    return Array.isArray(target) ? 'array' : (isFn(target) ? 'function' : 'object');
}

function getType(target){
    return Object.prototype.toString.call(target);
}

function hasOwnProperty(object, property){
    return Object.prototype.hasOwnProperty.call(object, property);
}

function isContainer(container){
    return (Containers.has(container) ? true : null);
}

// $Settings / $Config handles nested as values are copied by their data, like top-level sources.
function resolveContainer(value){
    return isContainer(value) ? Containers.get(value) : value;
}
