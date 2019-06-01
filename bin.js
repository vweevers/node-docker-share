#!/usr/bin/env node
'use strict'

const yargs = require('yargs')
const Shares = require('.')
const pkg = require('./package.json')

const name = pkg.name
const description = pkg.description

yargs.usage(`Usage: ${name} <command> [options]\n\n${description}`)

yargs.options({
  machine: {
    alias: 'm',
    description: 'Machine name (DOCKER_MACHINE_NAME or "default")',
    type: 'string'
  },
  verbose: {
    description: 'Verbose output',
    type: 'boolean'
  }
})

yargs
  .global(['machine', 'verbose'])
  .group(['machine', 'verbose'], 'Global options:')

yargs
  .command('mount', 'Create shared folder and mount it')
  .command('unmount', 'Unmount and remove shared folder if it exists')

yargs
  .epilogue(`Run '${name} <command> --help' for more information on a command.`)

const verbose = yargs.argv.verbose
const command = yargs.argv._[0]

if (command === 'mount') {
  yargs.reset()
    .usage(
      `Usage: ${name} mount [local path] [guest path]\n\n` +
      'Creates a VirtualBox shared folder and mounts it inside the VM. ' +
      'Without arguments, the local and guest path would respectively default to:\n' +
      '\n- ' + process.cwd() +
      '\n- ' + Shares.unixify(process.cwd())
    )
    .option('name', {
      alias: 'n',
      description: 'Shared folder name (basename of local path)',
      type: 'string'
    })
    .option('readonly', {
      alias: 'r',
      description: 'Create read-only shared folder',
      type: 'boolean'
    })
    .option('transient', {
      alias: 't',
      description: 'Create temporary shared folder',
      type: 'boolean'
    })
    .help()
    .example(`${name} mount`, 'Mount the current working directory')
    .example(`${name} mount -tr`, 'Read-only and temporary')
    .example(`${name} mount . /beep`, 'Mount working directory at /beep')

  const opts = yargs.argv
  const args = yargs.argv._.slice(1)

  opts.hostPath = args[0]
  opts.guestPath = args[1]

  new Shares({ machine: opts.machine }).mount(opts, bail)
} else {
  yargs.showHelp()
}

function bail (err) {
  if (err && verbose) {
    throw err
  } else if (err) {
    process.stderr.write(err.message + '.\n')
    process.exit(1)
  }
}
