const Central = Object.create(null);
const Containers = new WeakMap();
const Reserved = {
    '[object Object]': { '__proto__': true, 'prototype': true, 'constructor': true },
    '[object Array]': { 'length': true },
    '[object Function]': {  }
};

export const $Config = createImmutable('Config', function(){ return Object.create(null); });
export const $Settings = createImmutable('Settings', Object.create(null));
export const $Register = function(object){
    deepMergeNoOverwrite({ lock: true }, Central, object, true, false);
    return $Register;
};

export const $Central = function(target){
    target = (isCorrectObject(target) || isFn(target) ? target : Central);
    let isCentral = target === Central;
    if(!isCentral){ deepMergeNoOverwrite({ lock: true }, target, Central, true, false); }

    let interceptors = createImmutableInterceptors({
        name: 'Register',
        setContainer: function(message){
            return message + ' and Central(' + (!isCentral ? String(target) : '') + ')';
        }
    }, target);
    
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
    const messages = {
        defineProperty: function(message){ return name.defineProperty ? name.defineProperty(message) : message; },
        setPrototypeOf: function(message){ return name.setPrototypeOf ? name.setPrototypeOf(message) : message; },
        set: function(message){ return name.set ? name.set(message) : message; },
        deleteProperty: function(message){ return name.deleteProperty ? name.deleteProperty(message) : message; }
    };

    if(isObject(name)){
        messages.name = name.name;
        if(messages.name){
            name = messages.name;
        }
    }

    const interceptors = {
        lock: true,
        handlers: {
            defineProperty: function(target, prop, descriptor){
                if(interceptors.lock){ throw new Error(messages.defineProperty('Cannot define property "' + String(prop) + '" on ' + name)); }
                return Reflect.defineProperty(target, prop, descriptor);
            },

            setPrototypeOf: function(target, prototype){
                throw new Error(messages.setPrototypeOf('Cannot change prototype of ' + name));
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
                if(prop in target){ return Reflect.get(target, prop); }
                return undefined;
            }
        }
    };
    return interceptors;
}

function createImmutableFunction(name, targetFn){
    const handler = function(object){ return targetFn(object); };
    Object.defineProperty(handler, 'name', { value: name });
    return handler;
}

function deepMergeNoOverwrite(interceptors, target, source, silent, firstMode, parentKey, reference = new WeakSet()){
    const sourceIsContainer = isContainer(source);
    const mergeFirstMode = !firstMode ? (sourceIsContainer ? true : isCorrectObject(source)) : isCorrectObject(source);
    if(sourceIsContainer){ source = Containers.get(source); }
    if(!mergeFirstMode || reference.has(source)){ return target; }

    reference.add(source);
    for(let key of Reflect.ownKeys(source)){
        if(hasOwnProperty(source, key)){
            if(Reserved[getType(source)][key]){ continue; }

           let sourceValue = source[key];
            if(!(key in target)){
                if(isCorrectObject(sourceValue)){
                    let newContainer;
                    let recursive = true;
                    switch(getType(sourceValue)){
                        case '[object Array]': newContainer = []; break;
                        case '[object Object]': newContainer = Object.create(null); break;
                        case '[object Function]':
                            newContainer = Object.freeze(sourceValue);
                            recursive = false;
                        break;
                    }
                    setLocked(interceptors, target, key, newContainer);
                    if(recursive){
                        deepMergeNoOverwrite(interceptors, newContainer, sourceValue, silent, true, (parentKey || []).concat([String(key)]), reference);
                    }
                }
                else {
                    setLocked(interceptors, target, key, sourceValue);
                }
            }
            else if(isCorrectObject(target[key]) && isCorrectObject(sourceValue)){
                deepMergeNoOverwrite(interceptors, target[key], sourceValue, silent, true, (parentKey || []).concat([String(key)]), reference);
            }
            else if(!silent){
                throw new Error('Cannot reassign "' + (parentKey ? parentKey.join('"."') : String(key)) + '"');
            }
        }
    }

    return target;
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

function isCorrectObject(object){
    return isFn(object) || isObject(object) || Array.isArray(object);
}

function isObject(object){
    return getType(object) === '[object Object]';
}

function isFn(fn){
    return typeof fn === 'function';
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