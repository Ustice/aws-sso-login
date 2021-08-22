import { debug } from './terminal.mjs'

const args = require('yargs/yargs')(process.argv.slice(2))
  .usage(`0$ -u USER_NAME -p PASSWORD [arguments]`)
  .option('email', {
    alias: ['u', 'e', 'user'],
    demandOption: 'Username (email address) is required',
    describe: 'SSO email address',
    type: 'string',
  })
  .option('password', {
    alias: 'p',
    demandOption: 'Password is required',
    describe: 'Your password to your SSO account',
    type: 'string',
  })
  .option('show-browser', {
    alias: ['b', 'showBrowser'],
    describe: 'Runs the script in the browser, rather than in headless mode.',
    type: 'boolean',
    default: false,
  })
  .option('no-tty', {
    alias: ['t'],
    describe: 'Prints update information on multiples lines',
    type: 'boolean',
    default: false
  })
  .option('debug', {
    alias: ['d'],
    describe: 'Prints extra information for easier debugging',
    type: 'boolean',
    default: false,
  })
  .argv
  
  if (args.debug) {
    console.log(`Running in debug mode`)
    console.log(`args = ${ JSON.stringify(args, null, 2) }`)
  }

  if (!args.user) {
    throw new Error('You must enter a username (email address)')
  }

  if (!args.password) {
    throw new Error('You must enter a password')
  }

export default args