const nconf = require('nconf')
const path = require('path')

nconf.argv().env({separator: '__', parseValues: true, lowerCase: true})
nconf.defaults({ conf: path.resolve('config.json') })
nconf.file(nconf.get('conf'))

module.exports = nconf
