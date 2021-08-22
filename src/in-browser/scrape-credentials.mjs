// The function runs inside of the context of the browser. It can not depend
// on any external code, as those references will not survive serialization.
export default async function scrapeCredentialsFromAwsConsole() {
  const defaultWatchProperties = {
    every: 500,
    root: document,
    test: () => true,
    timeout: 30000,
  }

  await watchForAndClick("portal-application")
  const instanceSections = await watchForAndClick(".portal-instance-section .expandIcon")

  const accounts = Array.from(document.querySelectorAll("portal-instance"))

  const accountIdMap = accounts.reduce((accountIdMap, accountRoot) => {
    const name = accountRoot.querySelector('.name')?.textContent
    const accountId = accountRoot.querySelector('.accountId')?.textContent.replace(/^#/, '')

    if (!name || !accountId) {
      throw new Error('Could not find account names in this element.', accountRoot)
    }

    accountIdMap[accountId] = name

    return accountIdMap
  }, {})


  await watchForElements(
    ".portal-instance-section sso-expander", {
      test: (expanders) =>
        expanders?.length + instanceSections?.length &&
        expanders?.length === instanceSections?.length
    }
  )
  const credsLinks = await watchForAndClick('.creds-link a#temp-credentials-button')

  const creds = (await watchForElements(
    '#cli-cred-file-code .code-line', {
      test: (elements) => elements.length === credsLinks.length * 4
    }
  )).map(el => el.textContent.trim()).join('\n')

  return (
    Object.entries(accountIdMap)
      .reduce((creds, [accountId, name]) => creds.replaceAll(accountId, `${ name }_`), creds)
  )






  
  function usePromise() {
    let fail
    let succeed
    const promise = new Promise((resolve, reject) => [succeed, fail] = [resolve, reject])
    return [promise, succeed, fail]
  }

  async function watchForElements(
    selector, 
    { every = 500, root = document, test = () => true, timeout = 30000 } = defaultWatchProperties
  ) {
    console.debug(`Watching for ${selector} under`, root)
    let done = false

    const [promise, resolve, reject] = usePromise()

    const success = (result) => {
      console.debug(`Found ${selector}`)
      if (done) {
        return
      }

      clearInterval(interval)
      resolve(result)
      done = true
    }

    const cancel = () => {
      console.debug('Timeout while watching for ${ selector }')
      if (done) {
        return
      }

      clearInterval(interval)

      reject(new Error(`Timeout while watching for '${selector}' (${timeout / 1000}s)`))
      done = true
    }

    const check = () => {
      console.info(`Checking for selector ${selector}`)
      const elements = Array.from(root.querySelectorAll(selector))
      console.info(`Found ${elements.length}. It ${test(elements) ? 'checks' : 'does not check'} out.`)

      if (elements?.length && test(elements)) {
        return success(elements)
      }
      console.debug('failed test', elements)
    }

    const interval = setInterval(check, every)
    setTimeout(cancel, timeout)

    return promise
  }

  function clickAll(elementCollection) {
    [...elementCollection].forEach((el) => el.click())
  }

  async function watchForAndClick(selector) {
    console.log(`Watching for selector (${selector})`)
    const elements = await watchForElements(selector)
    console.log(`Found elements`, elements)
    clickAll(elements)

    return elements
  }
}