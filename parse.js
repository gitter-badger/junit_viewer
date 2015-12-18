var fs = require('fs')
var parser = require('xml2js').Parser()

var hashes = []

function createUniqueHash(identifier) {
    if (identifier)
        identifier = identifier + '_'
    else
        identifier = ''
    var hash = ''
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (var i = 0; i < 5; i++) hash += possible.charAt(Math.floor(Math.random() * possible.length))
    if (hashes.indexOf(hash) === -1) {
        hashes.push(hash)
        return identifier + hash
    } else
        return createUniqueHash(identifier)
}

function extractFileName(fileName) {
    var fileNameSplit = fileName.split('/')
    var name = fileNameSplit[fileNameSplit.length - 1]
    if (name === '')
        name = fileNameSplit[fileNameSplit.length - 2]
    return name
}

function isDirectory(folder) {
    return fs.lstatSync(folder).isDirectory()
}

function normaliseFileName(fileName) {
    if (fileName.charAt(0) === '.')
        fileName = __dirname + '/' + fileName

    if (!fs.existsSync(fileName)) {
        console.log(fileName, 'does not exist')
        return fileName + ' FILE DOES NOT EXIST'
    }

    if (isDirectory(fileName) && fileName.charAt(fileName.length - 1) !== '/')
        fileName = fileName + '/'

    return fileName
}

function isXml(fileName) {
    var fileSplit = fileName.split('.')
    return fileSplit[fileSplit.length - 1] === 'xml'
}

function createError(fileName, message) {
    return {
        name: fileName,
        type: 'failure',
        time: 0,
        tests: 0,
        testCases: [{
            name: fileName,
            messages: {
                values: [{
                    value: message
                }]
            },
            time: 0,
            type: 'error'
        }],
        properties: {
            values: []
        }
    }
}

function parseProperties(suites) {
    suites.forEach(function(suite) {
        var mergedProperties = {
            values: []
        }
        if (suite.properties) {
            suite.properties.forEach(function(property) {
                var prop = property.property
                if (prop === undefined)
                    return
                prop.forEach(function(p) {
                    mergedProperties.values.push(p)
                })
            })
        }
        suite.properties = mergedProperties
    })
}

function updateTest(test, testReults, type) {
    if (!Array.isArray(testReults))
        testReults = [testReults]

    test.type = type

    testReults.map(function(testReult) {
        if (typeof testReult === 'string')
            test.messages.values.push({
                value: testReult
            })
        else if (testReult.hasOwnProperty('_'))
            test.messages.values.push({
                value: testReult._
            })
        else if (testReult.hasOwnProperty('$') && testReult.$.hasOwnProperty('message') && testReult.$.hasOwnProperty('type'))
            test.messages.values.push({
                value: testReult.$.type + ' ' + testReult.$.message
            })
        else if (testReult.hasOwnProperty('$') && testReult.$.hasOwnProperty('message'))
            test.messages.values.push({
                value: testReult.$.message
            })
        else if (testReult.hasOwnProperty('$') && testReult.$.hasOwnProperty('type'))
            test.messages.values.push({
                value: testReult.$.type
            })
    })
}

function updateParsedSuite(testSuiteName, suite, test) {
    parsedSuites[testSuiteName] = parsedSuites[testSuiteName] || {
        name: testSuiteName,
        type: 'passed'
    }

    if (test.type !== 'passed' && test.type !== 'skipped')
        parsedSuites[testSuiteName].type = 'failure'

    if (suite.$) {
        parsedSuites[testSuiteName].tests = parsedSuites[testSuiteName].tests || suite.$.tests
        parsedSuites[testSuiteName].errors = parsedSuites[testSuiteName].errors || suite.$.errors
        parsedSuites[testSuiteName].failures = parsedSuites[testSuiteName].failures || suite.$.failures
        parsedSuites[testSuiteName].time = parsedSuites[testSuiteName].time || suite.$.time
    } else {
        parsedSuites[testSuiteName].tests = parsedSuites[testSuiteName].tests || 0
        parsedSuites[testSuiteName].errors = parsedSuites[testSuiteName].errors || 0
        parsedSuites[testSuiteName].failures = parsedSuites[testSuiteName].failures || 0
        parsedSuites[testSuiteName].time = parsedSuites[testSuiteName].time || 0
    }

    if (!parsedSuites[testSuiteName].hasOwnProperty('testCases'))
        parsedSuites[testSuiteName].testCases = []
    parsedSuites[testSuiteName].testCases.push(test)

    parsedSuites[testSuiteName].testCases.filter(function(test) {
        return test.type !== 'passed' || test.type !== 'skipped'
    })

    if (!parsedSuites[testSuiteName].hasOwnProperty('properties'))
        parsedSuites[testSuiteName].properties = {
            values: {}
        }


    suite.properties.values.forEach(function(property) {
        parsedSuites[testSuiteName].properties.values[property.$.name] = {
            name: property.$.name,
            value: property.$.value
        }
    })
}

function parseTests(suites, fileName) {
    suites.forEach(function(suite) {
        if (!suite.hasOwnProperty('testcase'))
            suite.testcase = []

        var suiteName
        if (suite.$ && suite.$.name)
            suiteName = suite.$.name

        suite.testcase = suite.testcase.filter(function(test) {
            return typeof test !== 'string'
        })

        suite.testcase.forEach(function(testcase) {
            var test = !testcase.hasOwnProperty('$') ? {
                name: fileName,
                messages: {
                    values: []
                },
                time: 0
            } : {
                name: testcase.$.name || fileName,
                messages: {
                    values: []
                },
                time: testcase.$.time || 0
            }

            if (testcase.passed)
                updateTest(test, testcase.passed, 'passed')
            else if (testcase.failure)
                updateTest(test, testcase.failure, 'failure')
            else if (testcase.error)
                updateTest(test, testcase.error, 'error')
            else if (testcase.skipped)
                updateTest(test, testcase.skipped, 'skipped')
            else
                updateTest(test, testcase, 'passed')

            var testSuiteName = 'NO CLASSNAME OR SUITE NAME'
            if (testcase.$ && testcase.$.classname)
                testSuiteName = testcase.$.classname
            else if (suiteName)
                testSuiteName = suiteName

            updateParsedSuite(testSuiteName, suite, test)
        })
    })

}

function extractSuite(suite, suitesToAdd) {
    suite.testsuite = suite.testsuite.filter(function(suite) {
        return typeof suite !== 'string'
    })

    suite.testsuite.forEach(function(childSuite) {
        if (suite.$ && childSuite.$)
            childSuite.$.name = suite.$.name + ' ' + childSuite.$.name
        suitesToAdd.push(childSuite)

        if (childSuite.testsuite)
            extractSuite(childSuite, suitesToAdd)
    })
}

function parseSuites(result, fileName) {
    var suites = []
    if (result.testsuites) {
        if (result.testsuites.testsuite)
            suites = result.testsuites.testsuite
        else if (result.testsuites)
            suites = [result.testsuites]
    } else if (result.testsuite)
        suites = [result.testsuite]

    suites = suites.filter(function(suite) {
        return typeof suite !== 'string'
    })

    var suitesToAdd = []
    suites.forEach(function(suite) {
        if (suite.testsuite)
            extractSuite(suite, suitesToAdd)
    })

    suites = suites.concat(suitesToAdd)

    parseProperties(suites)
    parseTests(suites, fileName)

    return suites
}

function parseTestResult(fileName) {
    if (!isXml(fileName))
        return

    var data = fs.readFileSync(fileName).toString()
    parser.parseString(data, function(err, result) {
        if (err !== null)
            parsedSuites[fileName] = createError(fileName, err.toString())
        else if (result === null)
            parsedSuites[fileName] = createError(fileName, 'There are no results')
        else
            parseSuites(result, fileName)
    })
}

function runThroughFolder(folder) {
    fs.readdirSync(folder).forEach(function(file) {
        var fileName = normaliseFileName(folder + file)
        if (isDirectory(fileName))
            runThroughFolder(fileName)
        else
            parseTestResult(fileName)
    })
}

var parsedSuites

module.exports = function(fileName) {
    parsedSuites = {}
    fileName = normaliseFileName(fileName)
    if (fileName.indexOf('FILE DOES NOT EXIST') !== -1)
        return {
            junitViewerFileError: fileName.slice(0, fileName.indexOf('FILE DOES NOT EXIST') - 1)
        }


    if (isDirectory(fileName))
        runThroughFolder(fileName, parsedSuites)
    else
        parseTestResult(fileName, parsedSuites)

    parsedSuites = Object.keys(parsedSuites).map(function(key) {
        return parsedSuites[key]
    })

    parsedSuites.forEach(function(suite) {
        suite.properties.values = Object.keys(suite.properties.values).map(function(key) {
            return suite.properties.values[key]
        })
    })

    parsedSuites.forEach(function(suite) {
        suite.id = createUniqueHash('suite')
        suite.testCases.forEach(function(test) {
            test.id = createUniqueHash('test')
            test.messages.id = createUniqueHash('messages')
            test.messages.values.forEach(function(message) {
                message.id = createUniqueHash('message')
            })
        })

        suite.properties.id = createUniqueHash('properties')
        suite.properties.values.forEach(function(property) {
            property.id = createUniqueHash('property')
        })
    })

    return {
        title: extractFileName(fileName),
        suites: parsedSuites
    }
}
