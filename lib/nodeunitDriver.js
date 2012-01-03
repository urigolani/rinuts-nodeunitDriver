//jslint igonres
/*globals module, console, require */

var reporter = require('./singleTestReporter'),
    crypto = require('crypto'),
    fs = require('fs'),
    rinuts = require('rinuts'),
    async = require('async');

// 
// private methods:

var _keys = function (obj) {
    if (Object.keys) {
        return Object.keys(obj);
    }
    var keys = [];
    for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
            keys.push(k);
        }
    }
    return keys;
};

/**
* Wraps a test function with setUp and tearDown functions.
* Used by testCase.
*
* @param {Function} setUp
* @param {Function} tearDown
* @param {Function} fn
* @api private
*/

var wrapTest = function (setUp, tearDown, fn) {
    return function (test) {
        var context = {};
        if (tearDown) {
            var done = test.done;
            test.done = function (err) {
                try {
                    tearDown.call(context, function (err2) {
                        if (err && err2) {
                            test._assertion_list.push(
                                types.assertion({ error: err })
                            );
                            return done(err2);
                        }
                        done(err || err2);
                    });
                }
                catch (e) {
                    done(e);
                }
            };
        }
        if (setUp) {
            setUp.call(context, function (err) {
                if (err) {
                    return test.done(err);
                }
                fn.call(context, test);
            });
        }
        else {
            fn.call(context, test);
        }
    };
};

/**
* Returns a serial callback from two functions.
*
* @param {Function} funcFirst
* @param {Function} funcSecond
* @api private
*/

var getSerialCallback = function (fns) {
    if (!fns.length) {
        return null;
    }
    return function (callback) {
        var that = this;
        var bound_fns = [];
        for (var i = 0, len = fns.length; i < len; i++) {
            (function (j) {
                bound_fns.push(function () {
                    return fns[j].apply(that, arguments);
                });
            })(i);
        }
        return async.series(bound_fns, callback);
    };
};


/**
* Wraps a group of tests with setUp and tearDown functions.
* Used by testCase.
*
* @param {Object} group
* @param {Array} setUps - parent setUp functions
* @param {Array} tearDowns - parent tearDown functions
* @api private
*/

var wrapGroup = function (group, setUps, tearDowns) {
    var tests = {};

    var setUps = setUps ? setUps.slice() : [];
    var tearDowns = tearDowns ? tearDowns.slice() : [];

    if (group.setUp) {
        setUps.push(group.setUp);
        delete group.setUp;
    }
    if (group.tearDown) {
        tearDowns.unshift(group.tearDown);
        delete group.tearDown;
    }

    var keys = _keys(group);

    for (var i = 0; i < keys.length; i += 1) {
        var k = keys[i];
        if (typeof group[k] === 'function') {
            tests[k] = wrapTest(
                getSerialCallback(setUps),
                getSerialCallback(tearDowns),
                group[k]
            );
        }
        else if (typeof group[k] === 'object') {
            tests[k] = wrapGroup(group[k], setUps, tearDowns);
        }
    }
    return tests;
};

//
// enumarates a group of tests by recursivly flatenning the tree-like structure which nodeunit tests posses through groups,
// applying a formatter function on each test that determines the test's data structure.
// test names are prefixed by their containing group followed by a '.'
// returns an array of tests after applying the formatter on each of them.
var mapTestTree = function (group, formatter, namePrefix) {
        var tests = [],
            key,
            test,
            testName;

        function addTest(test) {
            tests.push(test);
        }

        for (key in group) {
            if (group.hasOwnProperty(key)) {
                if (typeof group[key] === 'function') {
                    testName = namePrefix ? namePrefix + key : key;
                    test = formatter(group[key], testName);
                    addTest(test);					
                } else { // else key is a group of tests
                    mapTestTree(group[key], formatter, (namePrefix ? (namePrefix + key + '.') : (key + '.'))).forEach(addTest);
                }
            }
        }
        
        return tests;
    },

    //
    // Checks if a given path is a directory and applies 'cb' on the boolean result
    isDirectory = function (path, cb) {
        fs.stat(path, function (err, stat) {
            if (err) {
                cb(err);
                return;
            }

            if (stat.isDirectory()) {
                cb(null, true);
            } else {
                cb(null, false);
            }
        });
    },

    //
    // Loads all tests contained in 'module'.
    // Applies 'callback' on each of the contained tests.
    loadModule = function (module, callback) {
        var tests = [];              
                
        tests = mapTestTree(wrapGroup(module), function (test, name) {
            return {
                'testName': name,                
                metadata: test
            };
        });       

        callback(tests);
    },

    //
    // Loads all tests contained in the file at 'filePath'.
    // Applies 'callback' on each of the contained tests.
    loadfile = function (filePath, callback) {
        var module = require(filePath);

        loadModule(module, callback);
    },

    //
    // Loads tests from files and subdirectories contained in the directory at 'dirPath'.
    // Applies 'callback' on each of the contained tests.
    loadDir = function (dirPath, callback) {
        fs.readdir(dirPath, function (err, list) {
            if (err) {
                callback(err);
                return;
            }

            list.forEach(function (file) {
                file = dirPath + '/' + file;
                isDirectory(file, function (err, result) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    if (result === true) {
                        loadDir(file, callback);
                    } else {
                        loadfile(file, callback);
                    }
                });
            });
        });
    },

    //
    // the nodeunit driver class
    nodeunitDriver = function (moduleNames) {
        this.init(moduleNames);
    };

    nodeunitDriver.prototype = {
        //
        // A dictionary of test names and their data.
        // each test has the following form: 
        // {
        //     SHA1key: *THE SHA1 KEY BUILT FROM testName* 
        //     testName:     *THE NAME OF THE TEST* 
        //     metaData: *DATA REQUIRED IN ORDER TO RUN THE TEST*
        // }
        tests: {},

        //
        // Loads every node module appearing in modules
        // modules {object | array | string}: a nodeunit module | a path to nodeunit file | a path to a directory containing 
        //      nodeunit modules | an array containing any of the previous.
        init: function (modules) {
            var self = this,
            module,
            addTests = function (tests) {
                tests.forEach(function (test) {
                    // use the SHA1 of the test name as its key (for uniqueness
                    // and url-worthiness)
                    var key = crypto.createHash('sha1').update(test.testName).digest('hex');
                    test.SHA1key = key;
                    self.tests[key] = test;                    
                });
            };

            // if modules is not an array
            if (typeof modules !== 'object' || !modules.length) {
                module = modules;
                modules = [];
                modules.push(module);
            }

            modules.forEach(function (module) {
                if (typeof module === 'string') {
                    isDirectory(module, function (err, result) {
                        if (err) {
                            throw err;
                        }

                        if (result) {
                            loadDir(module, addTests);
                        } else {
                            loadfile(module, addTests);
                        }
                    });
                } else {
                    loadModule(module, addTests);
                }
            });
        },

        //
        // This method runs a test *SHA1key* and calls the callback on the 
        // test result. The callback on the test result upon completion.    
        // SHA1key {string}: The SHA1 key of the test. must be a key generated by enumTests method
        // context {object}: Test context. Attached to each nodeunit test's 'test' parameter
        // callback {function}: A call back function called upon test completion, receiving the test
        //           result as it's first argument
        runTest: function (SHA1key, callback, context) {
            var test = this.tests[SHA1key],
            testMethod,
            previousTestMethod;

            if (!test || !test.metadata) {
                callback('Failed to run test :"' + SHA1key + '". Not on service');
                return;
            }

            testMethod = test.metadata;

            // add context if available        
            if (context) {
                previousTestMethod = testMethod;
                testMethod = function (test) {
                    test.context = context;
                    previousTestMethod(test);
                };
            }

            reporter.run(test.testName, testMethod, callback);
        },

        //
        // applies *callback* on an array containing the tests names from testSuite.
        // assuming testSuite's functions are nodeunit style tests    
        // callback {function}: A callback receiving the test names enumaration (array) as its second argument. 
        enumTests: function (callback) {
            var testNames = [],
            key;
            for (key in this.tests) {
                if (this.tests.hasOwnProperty(key)) {
                    testNames.push(this.tests[key].SHA1key);
                }
            }

            callback(null, testNames);
        }
    };

//
//  listen(modules, port)
//  Loads 'modules' and starts listening for requests on 'port'. 
//  port {number}- string specifying the port number to listen on.
//  modules {string | array | object} - any of the following : a nodeunit module | a path to nodeunit file | 
//        a path to a directory (includes subdirs) | an array containing any of the previous.
exports.listen = function (modules, port) {
    var nuDriverinstance = new nodeunitDriver(modules),
        service = new rinuts(nuDriverinstance);
    service.listen(port);
};
