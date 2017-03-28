const fs = require('fs');
const util = require('util');
const circularJSON = require('circular-json');
const path = require('path');

const functionTracker = fn => {
  let fingerprints = [];
  let misfires = [];
  let test = undefined;
  const calibrate = successfulShotDescriptor => {
    test = successfulShotDescriptor;
    misfires = [];
    fingerprints.forEach((fingerprint) => {
      if(!test(fingerprint.result)) {
        misfires.push(fingerprint);
      }
    });
  };
  let proxyParts = {
    isProxy: true,
    isFunctionProxy: true,
    misfires,
    calibrate,
    fingerprints,
    dump: (cb=()=>{}) => {
      cb(misfires, fingerprints);
      misfires = [];
      fingerprints = [];
    },
    comprehensive: () => ({misfires, fingerprints})
  }
  return new Proxy(fn, {
    apply: (target, context, args) => {
      let start = process.hrtime();
      let startUsage = process.cpuUsage();
      let result = target.apply(context, args);
      let duration = process.hrtime(start);
      let cpu = process.cpuUsage(startUsage);
      duration = duration[0] * 1e9 + duration[1];
      let incidence = {args, result, duration, cpu};
      fingerprints.push(incidence);
      if (test) {
        if (!test(result)) {
          misfires.push(incidence);
        }
      }
      return result;
    },
    get: (target, prop, receiver) => {
      if (proxyParts[prop]) return proxyParts[prop];
      return target[prop];
    }
  });
}

const ObjectTracker = obj => {
  let trackedObjects = {};
  let trackedFunctions = {};
  let trackedPrimitives = {};
  let trackPrimitives = (t, prop) => {
    trackedPrimitives[prop] = trackedPrimitives[prop] || {result: new Set(), counter:0};
    trackedPrimitives[prop].result.add(t);
    trackedPrimitives[prop].counter ++;
    return t;
  }
  let proxyParts = {
    isProxy: true,
    isObjectProxy: true,
    trackedFunctions,
    trackedObjects,
    trackedPrimitives,
    dump: (cb=()=>{}) => {
      cb(trackedObjects, trackedFunctions, trackedPrimitives);
      trackedObjects = {};
      trackedFunctions = {};
      trackedPrimitives = {};
    },
    getTracked: () => Object.assign(trackedFunctions, trackedPrimitives, trackedObjects),
    getDeepTrackedObjects: () => {
      let current = [trackedObjects];
      let finished = [trackedObjects];
      let nextObj = current.pop();
      while(nextObj) {
        for (let tracked in nextObj) {
          let nested = trackedObjects[tracked];
          current.push(nested);
          finished.push(nested);
        }
        nextObj = current.pop();
      }
      return finished.filter(x => x !== undefined && x.isProxy);
    }
  }
  proxyParts.comprehensive = () => ({trackedFunctions, trackedObjects: proxyParts.getDeepTrackedObjects(), trackedPrimitives});
  let trackTypes = {
    function: (fn, target, prop) => {
      if (fn.isProxy) return fn;
      proxiedFn = functionTracker(fn);
      target[prop] = proxiedFn;
      trackedFunctions[prop] = proxiedFn;
      return proxiedFn;
    },
    object: (obj, target, prop) => {
      if (obj.isProxy) return obj;
      proxiedObj = ObjectTracker(obj);
      target[prop] = proxiedObj;
      trackedObjects[prop] = proxiedObj;
      return proxiedObj;
    },
    number: (n, target, prop) => {
      return trackPrimitives(n, prop);
    },
    string: (str, target, prop) => {
      return trackPrimitives(str, prop);
    },
    boolean: (bool, target, prop) => {
      return trackPrimitives(bool, prop);
    }
  }
  return new Proxy(obj, {
    get: (target, prop, receiver) => {
      if(proxyParts[prop]) return proxyParts[prop];
      let got = target[prop];
      if (got === undefined || got === null) return got;
      return trackTypes[typeof got](got, target, prop);
    }
  });
}

let analystMap = {
  function: fn => functionTracker(fn),
  object: obj => ObjectTracker(obj)
};
const defaultAutopsyObj = {objects: [], functions: [], errors:[], uncaughtPromises:[], filePath: path.resolve(process.cwd(),'autopsy.txt')}
const defaultAutopsy = (code, {objects, functions, errors, uncaughtPromises, filePath}) => {
  let result = {date: (new Date()).toUTCString(), code,memoryUsage: process.memoryUsage(), uncaughtPromises};
  result.trackedFunctions = functions.map(fn => Object.assign({}, {name: fn.name}, fn.comprehensive()));
  result.trackedObjects = objects.map(o => o.comprehensive());
  result.errors = errors.map(e => Object.assign({}, {stack: e.stack.split('\n').map(s => s.trim()), message: e.message}));
  fs.appendFileSync(filePath, circularJSON.stringify(result, null, 2)+'\n');
}
const flatten = arr => arr.reduce((result, next) => result.concat(next), []);
let instance;
class Forensic {
  constructor({recursive, autopsy, filePath}={recursive:true, autopsy:defaultAutopsy, filePath: path.resolve(process.cwd(),'autopsy.txt')}) {
    if (instance) {
      this.recursive = instance.recursive;
      this._trackedFunctions = instance._trackedFunctions;
      this._trackedObjects = instance._trackedObjects;
      this._errors = instance._errors;
      this._uncaughtPromises = instance._uncaughtPromises;
      this.filePath = instance.filePath
    } else {
      if (autopsy) this.autopsy = typeof autopsy === 'function' ? autopsy : defaultAutopsy;
      this.recursive = recursive;
      this._trackedFunctions = new Set();
      this._trackedObjects = new Set();
      this._errors = [];
      this._uncaughtPromises = [];
      this.filePath = filePath;
      this.hasRanAutopsy = false;
      process.on('beforeExit', code => {
        if (!this.hasRanAutopsy) {
          this.hasRanAutopsy = true;
          this.runAutopsy(code);
        }
      });
      process.on('exit', code => {
        if (!this.hasRanAutopsy) {
          this.hasRanAutopsy = true;
          this.runAutopsy(code);
        }
      });
      process.on('uncaughtException', (err) => {
        console.error(err);
        this._errors.push(err);
        process.exit(1);
      });
      process.on('unhandledRejection', (reason, p) => {
        this._uncaughtPromises.push({reason, p});
      });
      instance = this;
    }
  }
  static createNew(params = {autopsy:defaultAutopsy, filePath:path.resolve(process.cwd(),'autopsy.txt')}) {
    let newForensic = new Forensic(params);
    newForensic._trackedObjects = new Set();
    newForensic._trackedFunctions = new Set();
    newForensic._errors = [];
    newForensic._uncaughtPromises = [];
    process.on('beforeExit', newForensic.runAutopsy.bind(newForensic));
    process.on('exit', newForensic.runAutopsy.bind(newForensic));
    process.on('uncaughtException', (err) => {
      newForensic._errors.push(err);
      newForensic.runAutopsy(1);
    });
    process.on('unhandledRejection', (reason, p) => {
      newForensic._uncaughtPromises.push({reason, p});
    });
  }
  get instance() {
    return instance;
  }
  static get instance() {
    return instance;
  }
  trackObject(analyzed) {
    let creator = analystMap[typeof analyzed];
    if (!creator) return analyzed;
    let result = creator(analyzed);
    if (typeof analyzed === 'object') {
      this._trackedObjects.add(result);
    } else if (typeof analyzed === 'function') {
      this._trackedFunctions.add(result);
    }
    return result;
  }
  trackFunction(fn) {
    return this.trackObject(fn);
  }
  runAutopsy(code) {
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '');
    if (this.autopsy) {
      this.autopsy(code,
      {objects: Array.from(this._trackedObjects),
      functions: Array.from(this._trackedFunctions),
      errors: this._errors,
      uncaughtPromises: this._uncaughtPromises,
      filePath: this.filePath});
      process.exit(code);
    };
  }
};

module.exports = Forensic;
