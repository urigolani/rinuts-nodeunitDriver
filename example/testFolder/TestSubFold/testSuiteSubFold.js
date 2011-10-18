// Test File

exports.testSubFolder1 = function (test){
    test.ok(true, 'Test should pass');    
    test.done();    
};

exports.testSubFolder2 = function (test){
    test.equal(1, 1, 'Test should pass');    
    test.done();    
};