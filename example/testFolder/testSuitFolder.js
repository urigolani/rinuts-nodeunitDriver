// Test File

exports.testfolder1 = function (test){
    test.ok(true, 'Test should pass');    
    test.done();    
};

exports.testfolder2 = function (test){
    test.equal(1, 1, 'Test should pass'); 
    test.done();    
};