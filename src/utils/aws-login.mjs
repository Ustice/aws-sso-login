import { usePromise } from './promises.mjs'
import { useBrowser } from './puppeteer.mjs'
import { debug, updateStatus } from './terminal.mjs'
import args from './args.mjs'

import scrapeCredentialsFromPage from '../in-browser/scrape-credentials.mjs'

const EMAIL = args.email
const PASSWORD = args.password

export async function awsLogin () {
  const [ awsLoggingIn, awsLoggedIn, awsLogInFailed ] = usePromise()
  const [ gettingCredentialsPage, gotCredentialsPage, failedGettingCredentialsPage ] = usePromise()

  updateStatus('Logging in with AWS')

  const aws = $`/usr/local/bin/docker run --rm -t -v ~/.aws:/root/.aws -v ${__dirname}:/aws amazon/aws-cli:latest sso login`

  aws.stdout.on('data', async (data) => {
    const output = data.toString('utf8')

    const url = output.match(/(https?:\/\/[\S]*)/)[0]
    const code = output.match(/[A-Z]{4}-[A-Z]{4}/)

    if (output.startsWith('Attempting to automatically open the SSO authorization page')) {
      awsLoggedIn({ url, code })
      return
    }

    if (output.startsWith('Successully logged into')) {
      gotCredentialsPage(url)
      return
    }

    const awsLoginError = new Error('Unexpected result from `aws sso login`: ' + output)
    awsLogInFailed(awsLoginError)
    failedGettingCredentialsPage(awsLoginError)
  })

  const { url, code } = await awsLoggingIn

  await login(url, code)

  return await gettingCredentialsPage
}

async function login(url, code) {
  const browser = await useBrowser()
  const page = await browser.newPage()

  updateStatus(`Logging in to ${ url } with ${ code }`)

  await page.goto(url)
  await page.type('#verification_code', code)
  await page.click('button.awsui-signin-button')

  // Microsoft Sign-on
  updateStatus('Signing in with Microsoft Sign-on')

  await page.waitForSelector('input[type="email"]')

  await sleep(200)

  debug('Submitting email address')
  await page.type('input[type="email"]', `${EMAIL}\n`)

  if (await page.$('#usernameError')) {
    throw new Error('Invalid username.')
  }

  debug('Your username was accepted')

  debug('Waiting for the network to go idle')
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  const passwordInputSelector = 'input[type="password"]'
  
  // await page.waitForSelector('div[data-viewid="2"]')
  // await page.waitForSelector(passwordInputSelector)
  // await page.waitForSelector('input[type="submit"]')
  // await sleep(1000)

  
  debug('Entering password')
  await page.type(passwordInputSelector, PASSWORD)

  debug('Clicking submit')
  await page.click('input[type="submit"]')

  await page.waitForNavigation()

  debug('Verifying your password')
  const loginUrl = await page.url()

  if (loginUrl.match(/\/login$/)) {
    throw new Error('Invalid password.')

  }

  debug('Waiting for the network to go idle.')
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  debug('Your password was accepted')

  // The user is prompted by MS two-factor authentication here.
  updateStatus('Awaiting Microsoft Authenticator approval')
  await awaitApproval(page)

  // Authorise sign-in request
  updateStatus('Authorizing AWS SSO sign-in request')
  debug('Awaiting authorization')
  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  debug('Looking for the cancel button')
  await page.waitForSelector('#LoginForm')

  debug('Looking for the allow button')
  await page.waitForSelector('#cli_login_button')

  debug('Authorizing sign-in request')
  await page.click('#cli_login_button')

  // TODO: This may not be neccesary any more. I was seeing it get stuck here.
  page.click('#cli_login_button').catch(() => null)

  await page.waitForNavigation()
  await page.close()
}

export async function scrapeCredentials (url) {
  const browser = await useBrowser()

  const page = await browser.newPage()
  await page.goto(url)
  await page.waitForNavigation()
  await page.waitForSelector("portal-application")

  updateStatus('Gathering credentials.')

  const creds = await page.evaluate(scrapeCredentialsFromPage)
  const closingPage = page.close()

  const credContents = creds.replace(/\\n/, '\n')

  await closingPage

  return credContents
}

async function awaitApproval(page, retries = 0) {
  const waitTime = 1000
  const retryLimit = 60

  if (retries > retryLimit) {
    throw new Error("Timeout while waiting on approval.")
  }

  const url = await page.url()
  if (url === 'https://login.microsoftonline.com/common/SAS/ProcessAuth') {
    return await page.click('input[value="Yes"]')
  }

  await sleep(waitTime)

  updateStatus(
    `Check your Microsoft Authenticator app. Remaining time: ${ (retryLimit - retries) / waitTime * 1000 }s.`
  )
  return awaitApproval(page, retries + 1)
}