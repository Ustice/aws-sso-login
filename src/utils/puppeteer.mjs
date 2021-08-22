import args from './args.mjs'
import puppeteer from 'puppeteer'

const puppeteerConfig = {
  // When running on a Mac
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",

  headless: false || !args.showBrowser,
};

const openingBrowser = puppeteer.launch(puppeteerConfig)

export async function useBrowser () {
  return openingBrowser
}

export async function closeBrowser (exitCode) {
  const browser = await openingBrowser
  await browser.close()
  
  return exitCode
}

