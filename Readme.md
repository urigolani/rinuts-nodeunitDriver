
# rinuts-nodeunitDriver
  
  * Exposes nodeunit based tests through a RESTful api using [rinuts](http://github.com/urigolani/rinuts), allowing to remotely query for the urls of supported tests and to activate them, receiving a detailed test run summary.
  
  * Fully supports nodeunit structured tests, testcases and groups.
  
  * Supports loading of
		1. complete folders including subfolders for all contained test files
		2. specific files
		3. test modules objects (this allows one to consume a test module from another service);
    
  built on [node](http://nodejs.org) and [nodeunit](http://github.com/caolan/nodeunit)
 
## Installation

    Install with [npm](http://github.com/isaacs/npm):
    
        $ npm install rinuts		 

## Usage

### Starting the service:
        
    var path = require('path'),
        rinuts = require('rinuts-nodeunitDriver');

    rinuts.listen([path.resolve('/tests/testFolder'), path.resolve('../tests/testSuite1.js'), require('../testSuite2')], 9999);
### important note
	
	The name of the tests contained in modules introduced to this driver must differ from one another, otherwise they will overlap.
	Tests orginized in groups will have their containing group name appended prior to the test name, e.g:
	{
		groupA: {
			test1: function(test){
				...
				}
		}
	}
	
	will be reffered to by the driver as 'groupA.test1'.
	Thus having the following module included with the module above is O.K by naming: 
	{
		groupB: {
			test1: function(test){
				...
				}
		}
	}	
	
### Service API:
           
    * listen(modules, port)
        Loads 'modules' and starts listening for requests on 'port'. 
        [Argument] port - string specifying the port number to listen on.
        [Argument] modules - any of the following : a nodeunit module | a path to nodeunit file | 
              a path to a directory (includes subdirs) | an array containing any of the previous.
    
### HTTP exposed API:

    *	GET /tests : JSON response with a list of the tests exposed. Each test includes it's unique name and a POST URL which can be used to execute it. The list structure is as follows:
            {
                "*moduleName_testName*": {
                    "name": "*testName*",                    
                    "url":"/tests/*moduleName*/*testName*"
                    }
                ...
            }

    *	GET /tests/:testName : Returns an individual entry from the list above. has the form of:
			{
				"name": "*testName*",				
				"url": "/tests/*moduleName*/*testName*"}
    
    *	POST /tests/:testName : Executes the individual test and returns the test run summary, including stdout/err capture, in the following structure:            
            {
                "name": *testName*,
                "duration": *in milliseconds*,
                "state": *true|false*,
                "assertions": [{  
                                "method": *ok | fail etc...*
                                "success": *true|false*,             
                                "message": *assertion message*, // included only for failed tests
                                "stack": *stack trace*, // included only for failed tests					
                            }, 
                            ...
                            ]		
            }
