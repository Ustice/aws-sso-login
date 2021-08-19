import 'zx'
import puppeteer from "puppeteer";

const args = require('yargs/yargs')(process.argv.slice(2))
  .option('email', {
    alias: ['u', 'e', 'user'],
    demandOption: true,
    describe: 'SSO email address',
    type: 'string',
  })
  .option('password', {
    alias: 'p',
    demandOption: true,
    describe: 'Your password to your SSO account',
    type: 'string',
  })
  .argv


const ITI_EMAIL = args.email
const ITI_PASSWORD = args.password

const puppeteerConfig = {
  args: [
    // Required for Docker version of Puppeteer
    // "--no-sandbox",
    // "--disable-setuid-sandbox",
    // This will write shared memory files into /tmp instead of /dev/shm,
    // because Docker’s default for /dev/shm is 64MB
    // "--disable-dev-shm-usage",
    // "--cap-add=SYS_ADMIN",
  ],
  // When running on a Mac
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",

  //         ⬇   ⬇   ⬇   ⬇   ⬇   ⬇   ⬇   ⬇
  // ℹ️  --▶ This is how you debug your updates. ◀--
  //        ⬆   ⬆   ⬆   ⬆   ⬆   ⬆   ⬆   ⬆
  headless: false,
};

const configString = JSON.stringify(puppeteerConfig, null, 2);

const ID = (n) => n;

const normalizeError = (error) => {
  if (error instanceof Error) {
    return error;
  }

  const freshError = new Error(`Non-error object thrown: ${error.toString()}`);

  if (typeof freshError.stack === "string") {
    freshError.stack = freshError.stack.replace(/^([^\n]*)\n([^\n]*)/, "$1");
  }

  return freshError;
};

// turns Promise<T,R> into Promise<T|R>
const resultOf = async (promise) => promise.catch(normalizeError);

const useCallbackPromise = ({ withErrors = true }) => {
  let callback;

  const promise = new Promise(
    (resolve) =>
      (callback = (error, data) => {
        if (withErrors && error) {
          return resolve(normalizeError(error));
        }

        return resolve(data);
      })
  );

  return [callback, promise];
};

const sleepFor = async (ms) => {
  const [callback, promise] = useCallbackPromise({ withoutErrors: true });
  setTimeout(callback, ms);
  return promise;
};

const awaitApproval = async (page, retries = 0) => {
  const waitTime = 1000;
  const retryLimit = 60;

  if (retries > retryLimit) {
    throw new Error("Timeout while waiting on approval.");
  }

  const titleSelector = ".text-title";
  const approvedTitle = "Stay signed in?";

  await page.waitForSelector(titleSelector);
  const titleElement = await page.$(titleSelector);

  const title = await page.evaluate(
    (element) => element.innerText,
    titleElement
  );

  if (title === approvedTitle) {
    return await page.click('input[value="Yes"]');
  }

  console.log("Title: ", title);

  await sleepFor(waitTime);

  console.log(
    `Awaiting approval. Tried ${retries} times. Trying again in ${waitTime}.`
  );
  return awaitApproval(page, retries + 1);
};

let browser;

const login = async (page, url, code) => {
  await page.goto(url)
  await page.type('#verification_code', code)
  await page.click('button.awsui-signin-button')

  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', `${ITI_EMAIL}\n`);
  const passwordInputSelector = 'input[type="password"]';
  await page.waitForNavigation();
  await page.waitForSelector(passwordInputSelector);
  await page.waitForSelector('input[type="submit"]');
  await sleepFor(1000);
  await page.type(passwordInputSelector, ITI_PASSWORD);
  await page.click('input[type="submit"]');
  await awaitApproval(page);

  await page.waitForNavigation();
  await page.waitForSelector('#cli_cancel_link')
  await page.click('#cli_login_button')

  await page.waitForNavigation();
  await page.waitForSelector("portal-application");
  await page.click("portal-application");

  await page.waitForSelector("portal-instance .instance-section");
  const creds = await page.evaluate(async () => {
    const usePromise = () => {
      let fail
      let succeed
      const promise = new Promise((resolve, reject) => [succeed, fail] = [resolve, reject])
      return [promise, succeed, fail]
    }

    const watchForElements = async (
      selector, 
      {
        every = 500,
        root = document,
        test = () => true, 
        timeout = 30_000,
      } = {
        every: 500,
        root: document,
        test: () => true, 
        timeout: 30_000,
      }
    ) => {
      console.debug(`Watching for ${ selector }`)
      let done = false
      const [promise, resolve, reject] = usePromise()
      const success = (result) => {
        console.debug(`Found ${ selector }`)
        if (done) { return }

        resolve(result);
        done = true
      }

      const cancel = () => {
        console.debug('Timeout while watching for ${ selector }')
        if (done) { return }

        clearInterval(interval)

        reject(new Error(`Timeout while watching for '${ selector }' (${ timeout/2 }s)`))
        done = true
      }

      const check = () => {
        const elements = [...root.querySelectorAll(selector)]
        if (elements?.length && test(elements)) {
          return success(elements)
        }
        console.debug('failed test', elements)
      }
      const interval = setInterval(check, every)
      setTimeout(cancel, timeout)
      
      return promise
    }

    const clickAll = (elementCollection) => { [ ...elementCollection ].forEach((el) => el.click) }

    const watchForAndClick = async (selector) => clickAll(await watchForElements(selector))

    await watchForAndClick("portal-application")
    const instanceSections = await watchForAndClick(".portal-instance-section .expandIcon")
    await watchForElements(".portal-instance-section sso-expander", { test: (expanders) => expanders.length === instanceSections.length })
    const credsLinks = await watchForAndClick('.creds-link a#temp-credentials-button')

    const creds = (await watchForElements(
      '#cli-cred-file-code .code-line', 
      { test: (elements) => elements.length === credsLinks.length * 4 }
    )).map(el => el.textContent.trim()).join('\n')

    console.log("\n\n=== CREDENTIALS ===\n\n", creds)
    return creds
  });

  const credContents = creds.replace(/\\n/, '\n')
  console.log("\n\n=== CREDENTIALS ===\n\n",credContents)
    return credContents
}

const conclusion = async (result) => {
  await browser.close();

  if (result instanceof Error) {
    console.error(result);
    return process.exit(1);
  }

  return result;
};

const start = async () => {
  const browser = await puppeteer.launch(puppeteerConfig);
  const page = await browser.newPage();

  const aws = $`/usr/local/bin/docker run --rm -t -v ~/.aws:/root/.aws -v ${__dirname}:/aws amazon/aws-cli:latest sso login`
  aws.stdout.on('data', async (data) => {
    const output = data.toString('utf8')
    if (output.startsWith('Successully logged into')) {
      console.log('~~~ Logged in successfully')
      const url = output.match(/(http[\S]*)/)[0]

      page.goto(url)
      return
    }

    console.log('~~~ Logging in to AWS SSO')
    
    const url = output.match(/(http[\S]*)/)[0]
    const code = output.match(/[A-Z]{4}-[A-Z]{4}/)

    const fileContents = await login(page, url, code)
  })

  await aws
  await $`sleep 3600`

}


start().then((result) => {
  console.log('~~~ COMPLETE WITHOUT ERRORS', result);
  process.exit();
}).catch((error) => {
  console.error('~~~ COMPLETE WITHOUT ERRORS', error)
  process.exit(1);
});
