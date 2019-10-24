import nconf from 'nconf'
import * as path from 'path'

const lowerCase = process.env.LOWER_CASE_ENV_VARS !== 'false'
nconf.argv().env({ separator: '__', parseValues: true, lowerCase })
nconf.defaults({ conf: path.resolve('config.json') })
nconf.file(nconf.get('conf'))

export default nconf
