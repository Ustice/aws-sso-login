import 'zx'

import { resolve } from 'path'

import { closeBrowser } from './src/utils/puppeteer.mjs'
import { awsLogin, scrapeCredentials } from './src/utils/aws-login.mjs'
import { updateStatus } from './src/utils/terminal.mjs'
import args from './src/utils/args.mjs'

const awsCredentialsPath = resolve(os.homedir(), '.aws/credentials')

main()
  .then(() => 0)
  .catch((error) => {
    console.error(error)

    if (!args.showBrowser) {
      return 1
    }

    return question('Press Enter key to close the browser and quit.')
      .then(() => 1)
  })
  .then(closeBrowser)
  .then(process.exit.bind(process))


async function main () {
  updateStatus('Logging in to AWS SSO')
  const credentialsUrl = await awsLogin()

  updateStatus('Gathering credentials from AWS Console')
  const fromBrowser = await scrapeCredentials(credentialsUrl)
  const fileContents = fromBrowser.replace(/\n(\[[^\]]*\])$/gm, '\n\n$1')

  updateStatus('Updating credential file.')
  await fs.writeFile(awsCredentialsPath, fileContents)

  updateStatus('AWS Credentials updated')
}
