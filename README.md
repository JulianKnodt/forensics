# Forensics

`npm i forensics`

```javascript
const Forensics = require("forensics");
let detective = new Forensics();
const express = detective.track(require('express'));
const dbController = detective.track(require('./fakeThing'));
const sum = detective.trackFunction((a,b) => a + b);

sum(1, 2); sum(3,4); sum(5,6);
dbController.getUserById('3'); //Forensics can only track direct return values

invalidFunctionToKillProcess()
//Detective writes report to ./autopsy.txt
```

### class: Forensics```({[autopsy function], [filePath path]}) ```
Creates a new instance of a forensics object. If it's the first within the application context, it creates a whole new one, else it points its references to the first instance.

If it's necessary to create a whole new instance, use ```Forensic.createNew({[autopsy function], [filePath path]})```

#### forensics.trackObject(anything)
Returns a tracked object. Should be used for construction of objects and functions.

#### forensics.trackFunction(fn)
Used for functions, but maps back to trackObject

#### Forensics.instance
Return instance of instantiated forensics object or undefined

#### Forensics.createNew(same as constructor)
Create a new instance of a forensics object

---

### class: ObjectTracker
Monitored proxy objects

#### objectTracker.isProxy === true

#### objectTracker.isObjectProxy === true

#### objectTracker.trackedObjects

```user.options.tooling = false```

Gets objects that are contained by the root objectTracker and how many times they've been accessed. They will also be turned into ObjectTracker instances
#### objectTracker.trackedFunctions

```user.getFriends()```

Gets functions contained by the root object that are being monitored. Each function becomes a tracked function once invoked or retrieved.

#### objectTracker.trackedPrimitives

```console.log(user.name)```
tracked primitives and their return values

#### objectTracker.getDeepTrackedObjects()

```user.getDeepTrackedObjects()```

Gets nested tracked objects and returns it as a flat array

#### objectTracker.comprehensive()

```user.comprehensive()```

returns all of the above as an object

#### objectTracker.dump([callback])

```user.dump(cb(trackedObjects, trackedFunctions, trackedPrimitives));```

Resets all tracked properties for memory purposes for long running applications.
Callback is invoked on old trackedObjects, trackedFunctions, and trackedPrimitives
---

### class: FunctionTracker
Monitored function objects
Tracks duration of function call, cpu usage, arguments, and duration.

#### functionTracker.isProxy === true
```sum.isProxy```

#### functionTracker.isFunctionProxy === true
```sum.isFunctionProxy```

#### functionTracker.calibrate(testFn)
```sum.calibrate(result => typeof result === 'number')```
A test function which when returns false, will pass the failure into an array of failed function calls. Can be used to validate results on the fly.

#### functionTracker.misfires
```sum.misfires === ['ab', null, undefined]```
Array of arguments and results that did not pass the test provided by calibrate

#### functionTracker.fingerprints
```sum.fingerprints //object```
Array of all invokations of the function with arguments, duration, cpu usage, and results.

#### functionTracker.comprehensive()
```sum.comprehensive()```
returns all of the above as an object

#### functionTracker.dump([callback])

```sum.dump(cb(misfires, fingerprints));```
Resets misfires and fingerprints for memory purposes.
The callback ins invoked with old misfires and fingerprints

--- 
##### MIT
