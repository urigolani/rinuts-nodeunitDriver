//jslint igonres
/*globals module, console, require */

var reporter = require('./singleTestReporter'),
    crypto = require('crypto'),
    fs = require('fs'),
    rinuts = require('rinuts'),
    async = require('async');

// 
// private methods:

// Deep copies an object, containing nor arrays
var deepCopy = function (copyFrom) {
    var copyTo,
        key;

    if (typeof copyFrom === 'function') {
        return copyFrom;
    } else if (typeof copyFrom === 'object') {
        copyTo = {};
        for (key in copyFrom) {
            if (copyFrom.hasOwnProperty(key)) {
                copyTo[key] = deepCopy(copyFrom[key]);
            }
        }

        return copyTo;
    }
}

//
// Enumarates a group of tests by recursivly flatenning the tree-like structure which nodeunit tests posses through groups,
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
                    if (key !== "setUp" && key !== "tearDown") {
                        testName = namePrefix ? namePrefix + key : key;
                        test = formatter(testName);
                        addTest(test);					
                    }
                } else { // else key is a group of tests
                    mapTestTree(group[key], formatter, (namePrefix ? (namePrefix + key + ' - ') : (key + ' - '))).forEach(addTest);
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
                
        tests = mapTestTree(module, function (name) {
            return {
                'testName': name,                
                metadata: module
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

            reporter.run(test.testName, deepCopy(test.metadata), context, callback);
        },

        //
        // applies *callback* on an array containing the tests names from testSuite.
        // assuming testSuite's functions are nodeunit style tests    
        // callback {function}: A callback receiving the test names enumaration (array) as its second argument. 
        enumTests: function (callback) {
            var tests = [],
            key;
            for (key in this.tests) {
                if (this.tests.hasOwnProperty(key)) {
                    tests.push({
                        name: this.tests[key].testName,
                        identifier: this.tests[key].SHA1key
                    });
                }
            }

            callback(null, tests);
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
