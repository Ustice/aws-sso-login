import args from '../utils/args.mjs'

export function updateStatus (message) {
  const _ = process.stdout

  if (args.debug || !args['no-tty']) {
    console.log(message)

    return
  }
  
  _.write(message, () => {
    _.clearLine(() => {
      _.cursorTo(0)
    })  
  })
}

export function debug (message) {
  if (!args.debug) {
    return
  }

  console.log(message)
}