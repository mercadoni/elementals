import nconf from 'nconf'
import * as path from 'path'

nconf.argv().env({ separator: '__', parseValues: true, lowerCase: true })
nconf.defaults({ conf: path.resolve('config.json') })
nconf.file(nconf.get('conf'))

export default nconf
