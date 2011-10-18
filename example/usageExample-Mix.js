var path = require('path'),
    rinuts = require('./../index.js');

rinuts.listen([require('./testSuite1'), path.resolve('testFolder'), path.resolve('testSuite2')], 9999);








